// Labels the current part of a song (intro, groove, buildup, break, drop, outro, quiet) and notices when the next song starts.
//
// Three layers, every one causal (it only ever looks back):
//  1. section-features.ts turns the five onset-band levels into a feature vector every 250 ms, all relative to the song's own levels.
//  2. section-model.ts runs gradient-boosted trees, trained on 339 expert-labelled EDM tracks, on those features: how much the last
//     stretch looks like a buildup or a break, whether a drop just landed, and whether a new song just started.
//  3. This file turns those probabilities into labels that hold still: smoothing, enter and leave thresholds, a refractory time
//     after a drop, and the song-level rules (no labels without a regular beat, the song clock, intro and outro).
//
// The thresholds below were tuned on out-of-fold model output (scripts/section-eval/decode.py), not by eye. See
// docs/implementation-plans/song-sections.md for how it was measured and how well it does.
import { estimateTempo } from './tempo'
import { FEATURE_COUNT, FEATURE_NAMES, SLOT_MS, SectionFeatures } from './section-features'
import { SectionModelData, boosterScores, sigmoid, softmaxInPlace } from './section-model'
import modelData from './section-model.json'
import { TickRecorder } from './tick-recorder'
import type { GridState } from './beat-grid'

export type SongSection = 'intro' | 'quiet' | 'groove' | 'buildup' | 'turnaround' | 'break' | 'drop' | 'outro'

export type SectionState = {
  section: SongSection
  /** How loud the song is right now against its own recent peak, 0 to 1. */
  intensity: number
  /** How far into a typical buildup we are, 0 to 1. Zero outside a buildup. */
  buildupProgress: number
  /** How long the current section has lasted. */
  sinceMs: number
  /** How many songs the tracker has seen start since it began (1 for the first). Goes up on every song change. */
  songIndex: number
  /** How long the current song has been going (an estimate: it is counted from when the tracker thinks the song began), or null until it looks like a song is playing. */
  songMs: number | null
  /** Drops heard in this song so far. Goes up by one on the slot a drop lands, so a change in it is the drop event. */
  dropCount: number
  /** How long since the last drop in this song, or null before the first. */
  sinceDropMs: number | null
  /** How sure the model is of a buildup or break while one is shown (its smoothed probability), 1 for the other sections. */
  confidence: number
}

export type SectionSample = {
  t: number
  /** Band levels (% of full scale), in ONSET_BANDS order: bass, lo, mid, hi, air. */
  levels: readonly number[]
  /** True on the frame a beat was detected. */
  beat: boolean
  /** The beat grid's state on this frame (beat-grid.ts), when the app runs one. The model reads where the moment sits in the bar and phrase. */
  grid?: GridState | null
}

/** One closed slot of the history, with the section that was shown for it. */
export type SectionSlot = {
  t: number
  total: number
  low: number
  mid: number
  high: number
  beats: number
  section: SongSection
}

/**
 * Decoder settings that can be overridden, for testing variants offline (scripts/section-eval/run.mts --tuning). The app uses the defaults.
 *
 * A turnaround is the music cutting out during a buildup: the whole mix far under the song's top level with the bass gone, for a moment. It is
 * a real, visible moment, but not a drop forecast: measured live and out of fold, about 1 in 4 is followed by a drop (with about 2 s of
 * warning); the rest are stops inside a build that carries on, or builds that turn into a break. Lowering the drop threshold around one made
 * drop detection slightly worse, so it does not (turnaroundDropThreshold and fillDropThreshold stay null). Looking back at whole songs, a stop
 * after a buildup that comes back up lands on a drop about 6 times in 10, but whether it comes back is exactly what is not known yet live.
 */
export type SectionTuning = {
  /** Drop threshold, and the stricter one while a buildup or break is still showing. */
  dropThreshold: number
  dropContextThreshold: number
  /** Drop threshold during a turnaround and for a moment after the music comes back (null: no special threshold). */
  turnaroundDropThreshold: number | null
  turnaroundDropWindowMs: number
  /** Drop threshold for a moment after a stop that was not a turnaround (a fill), or null for none. */
  fillDropThreshold: number | null
  /** What counts as a stop: the whole mix and the bass this far under the song's top level, for this many slots. */
  stopTotalDb: number
  stopBassDb: number
  stopSlots: number
  /** A stop counts as a turnaround while a buildup is showing (or this soon after), and for at most this long. */
  turnaroundAfterBuildupMs: number
  turnaroundMaxMs: number
  /** The music is back once the whole mix is over this. */
  turnaroundLeaveDb: number
  /**
   * The phrase-line prior: while the beat grid is locked and its phrase confidence is at least phraseLineMinConfidence, the drop threshold
   * moves by phraseLineDropOffset within phraseLineBeats beats of an 8-bar line and by offPhraseDropOffset elsewhere (decode.py tunes them).
   */
  phraseLineBeats: number
  phraseLineDropOffset: number
  offPhraseDropOffset: number
  phraseLineMinConfidence: number
}

const DEFAULT_TUNING: SectionTuning = {
  dropThreshold: 0.3,
  dropContextThreshold: 0.5,
  turnaroundDropThreshold: null,
  turnaroundDropWindowMs: 2000,
  fillDropThreshold: null,
  stopTotalDb: -10,
  stopBassDb: -15,
  stopSlots: 2,
  turnaroundAfterBuildupMs: 250,
  turnaroundMaxMs: 6000,
  turnaroundLeaveDb: -6,
  phraseLineBeats: 2,
  phraseLineDropOffset: 0,
  offPhraseDropOffset: 0,
  phraseLineMinConfidence: 0,
}

/** One recorded 50 ms tick: when it closed, the mean power of each band and the beats in it. Enough to replay a session exactly. */
export type SectionTick = { t: number; power: number[]; beats: number }

const DEFAULT_MODEL = modelData as SectionModelData
const HISTORY_MS = 120000
// Every tick of the last 40 minutes is kept, so a listening session can be exported and replayed offline (1.4 MB, see TickRecorder).
const RECORDING_TICKS = 48000

// The decoder (tuned on out-of-fold output, see decode.py).
const SMOOTH_S = 0.5
const BUILDUP_IN = 0.3
const BUILDUP_OUT = 0.2
const BREAK_IN = 0.3
const BREAK_OUT = 0.25
const ENTER_SLOTS = 2
// A break that sounds more like a buildup by this margin turns into one (breaks often lead into a build).
const SWITCH_MARGIN = 0.15
// The drop thresholds are in SectionTuning. While a buildup or break is still showing (or has just ended) a drop needs more evidence: the end
// of a build already looks like a drop is coming, and one fired a moment early would hold off the real one for the refractory time.
const DROP_CONTEXT_MS = 1000
const DROP_REFRACTORY_MS = 6000
const NO_DROP_BEFORE_MS = 8000
// A drop is the high-energy part after the drop lands; with no break or buildup to end it, it is called groove after this long.
const DROP_SECTION_MAX_MS = 64000
const BUILDUP_TYPICAL_MS = 16000

// Song changes: the model's boundary probability, or silence long enough that nothing inside a song does it (see the plan for the numbers).
const BOUNDARY_THRESHOLD = 0.9
const MIN_SONG_MS = 45000
const SILENCE_NEW_SONG_S = 6
// Silence this long shows as quiet, whatever the section was.
const SILENCE_SHOWN_S = 1
// A "song" with fewer beats than this was never really a song (the app opened on silence or stray noise), so the next one is not a second song.
const SONG_MIN_BEATS = 6

// It takes this long, with a regular beat going, to believe a song is playing. Silence, stray noise and typing do not get a song time.
const SONG_CONFIRM_MS = 8000
const SONG_CONFIRM_WINDOW_MS = 8000
const SONG_CONFIRM_BEATS = 8
const SONG_CONFIRM_CONSISTENCY = 0.5
const SONG_CONFIRM_CHECK_SLOTS = 8
const SONG_LOST_MS = 25000
const SONG_LOST_BEATS = 2
const BEAT_MEMORY_MS = 30000

// Intro: the start of a song until its first buildup or drop, at most this long. Outro: a fade late in a song that has had a drop.
const INTRO_MAX_MS = 60000
const OUTRO_MIN_SONG_MS = 150000
const OUTRO_LEVEL_DB = -10
const OUTRO_SLOPE_DB_S = -0.3
const OUTRO_LEAVE_DB = -6

const feature = (name: string): number => {
  const index = FEATURE_NAMES.indexOf(name)
  if (index < 0) throw new Error(`section model: unknown feature ${name}`)
  return index
}
const F_REL_TOTAL = feature('relTotal')
const F_SLOPE16_MID = feature('slope16_mid')
const F_SLOPE16_LO = feature('slope16_lo')
const F_SILENCE_NOW = feature('silenceNow')
const F_GRID_LOCKED = feature('gridLocked')
const F_INTO_PHRASE = feature('beatsIntoPhrase')
const F_PHRASE_CONFIDENCE = feature('phraseConfidence')
const BEATS_PER_PHRASE = 32

// A model reads the first `features.length` features, so one trained before the grid columns were added still runs.
const checkModel = (model: SectionModelData): SectionModelData => {
  if (model.features.length > FEATURE_COUNT || model.features.some((name, i) => name !== FEATURE_NAMES[i])) {
    throw new Error('section model: trained on different features than section-features.ts computes; retrain it')
  }
  return model
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))
const toDb = (value: number): number => 20 * Math.log10(Math.max(value, 1e-3))

type Decoded = 'groove' | 'buildup' | 'break' | 'drop'

export class SectionTracker {
  private features = new SectionFeatures()
  private readonly slots: SectionSlot[] = []
  private readonly recording = new TickRecorder(RECORDING_TICKS)
  private beatTimes: number[] = []
  private lastT: number | null = null
  private sums = { total: 0, low: 0, mid: 0, high: 0 }
  private frames = 0
  private beats = 0

  // Model state.
  private readonly scores: number[] = []
  private readonly smoothed = [1, 0, 0]
  private smoothedReady = false
  private readonly memoryBuild: number[] = []
  private readonly memoryBreak: number[] = []
  private readonly stage2Input: Float64Array
  private readonly model: SectionModelData
  private readonly tuning: SectionTuning

  // Decoder state.
  private decoded: Decoded = 'groove'
  private sectionStart = 0
  private shownSection: SongSection = 'quiet'
  private shownStart = 0
  private buildRun = 0
  private breakRun = 0
  private lastDrop = -Infinity
  private lastSetup = -Infinity
  private lastBuildup = -Infinity
  private turnaroundStart: number | null = null
  private lastTurnaroundEnd = -Infinity
  private lastFillEnd = -Infinity
  private stopRun = 0
  private phraseOffset = 0
  private dropCount = 0
  private hadBuildupOrDrop = false
  private outro = false

  // Song state.
  private songStart: number | null = null
  private songIndex = 1
  private songConfirmed = false
  private confirmSlots = 0
  private beatsThisSong = 0
  private silenceBoundary = false
  private state: SectionState = SectionTracker.emptyState()

  /** `model` and `tuning` are for evaluating variants offline and for tests; the app uses the shipped model and the defaults. */
  constructor(model: SectionModelData = DEFAULT_MODEL, tuning: Partial<SectionTuning> = {}) {
    this.model = checkModel(model)
    this.tuning = { ...DEFAULT_TUNING, ...tuning }
    this.stage2Input = new Float64Array(model.features.length + 3 + model.memorySeconds.length * 4)
  }

  private static emptyState = (): SectionState => ({
    section: 'quiet', intensity: 0, buildupProgress: 0, sinceMs: 0, songIndex: 1, songMs: null, dropCount: 0, sinceDropMs: null, confidence: 1,
  })

  push = ({ t, levels, beat, grid = null }: SectionSample): void => {
    // A long gap between samples (the tab was in the background) is a fresh start, not a song that went quiet.
    if (this.lastT !== null && t - this.lastT > HISTORY_MS) this.startSong(t, this.beatsThisSong >= SONG_MIN_BEATS, false)
    this.lastT = t
    const bass = levels[0] ?? 0
    const lo = levels[1] ?? 0
    const mid = levels[2] ?? 0
    const hi = levels[3] ?? 0
    const air = levels[4] ?? 0
    this.sums.low += (bass + lo) / 2
    this.sums.mid += mid
    this.sums.high += (hi + air) / 2
    this.sums.total += (bass + lo + mid + hi + air) / 5
    this.frames++
    if (beat) {
      this.beats++
      this.beatsThisSong++
      this.beatTimes.push(t)
    }
    const features = this.features
    const ticks = features.ticks
    const row = features.push(t, levels, beat, grid)
    if (features.ticks !== ticks) {
      const { power, beats } = features.getLastTick()
      this.record(t, power, beats)
    }
    if (row) this.closeSlot(t, row)
  }

  /** Replays one recorded tick (see getRecording): the same path as live frames from the tick on. */
  pushTick = ({ t, power, beats }: SectionTick): void => {
    if (this.lastT !== null && t - this.lastT > HISTORY_MS) this.startSong(t, this.beatsThisSong >= SONG_MIN_BEATS, false)
    this.lastT = t
    const level = power.map((p) => Math.sqrt(p))
    this.sums.low += ((level[0] ?? 0) + (level[1] ?? 0)) / 2
    this.sums.mid += level[2] ?? 0
    this.sums.high += ((level[3] ?? 0) + (level[4] ?? 0)) / 2
    this.sums.total += level.reduce((sum, v) => sum + v, 0) / 5
    this.frames++
    this.beats += beats
    this.beatsThisSong += beats
    for (let b = 0; b < beats; b++) this.beatTimes.push(t)
    this.record(t, power, beats)
    const row = this.features.tick(power, beats)
    if (row) this.closeSlot(t, row)
  }

  getState = (): SectionState => this.state

  /** Every 50 ms tick of the last 40 minutes at most, oldest first. Builds the list each call: for an export, not every frame. */
  getRecording = (): SectionTick[] => this.recording.toTicks()

  /** The closed slots of the last two minutes, oldest first. Not a copy: read it where it is called. */
  getHistory = (): readonly SectionSlot[] => this.slots

  reset = (): void => {
    this.features = new SectionFeatures()
    this.slots.length = 0
    this.recording.clear()
    this.beatTimes = []
    this.lastT = null
    this.sums = { total: 0, low: 0, mid: 0, high: 0 }
    this.frames = 0
    this.beats = 0
    this.songIndex = 1
    this.startSong(0, false, false)
    this.songStart = null
    this.state = SectionTracker.emptyState()
  }

  private record = (t: number, power: ArrayLike<number>, beats: number): void => {
    this.recording.push(t, power, beats)
  }

  private closeSlot = (t: number, row: Float64Array): void => {
    const frames = Math.max(this.frames, 1)
    const slot: SectionSlot = {
      t,
      total: this.sums.total / frames,
      low: this.sums.low / frames,
      mid: this.sums.mid / frames,
      high: this.sums.high / frames,
      beats: this.beats,
      section: this.shownSection,
    }
    this.sums = { total: 0, low: 0, mid: 0, high: 0 }
    this.frames = 0
    this.beats = 0
    this.slots.push(slot)
    const oldest = this.slots.findIndex((s) => t - s.t <= HISTORY_MS)
    if (oldest > 0) this.slots.splice(0, oldest)
    const oldestBeat = this.beatTimes.findIndex((time) => t - time <= BEAT_MEMORY_MS)
    if (oldestBeat > 0) this.beatTimes.splice(0, oldestBeat)
    else if (oldestBeat < 0) this.beatTimes = []

    this.songStart ??= t
    const [pBuild, pBreak, pDrop, pBoundary] = this.runModel(row)
    const silence = row[F_SILENCE_NOW]!

    // A new song: a long silence that ends, or the model hearing a song change (never within the first stretch of a song).
    if (silence >= SILENCE_NEW_SONG_S && this.beatsThisSong >= SONG_MIN_BEATS) this.silenceBoundary = true
    if (this.silenceBoundary && silence === 0) {
      this.startSong(t, true, false)
    } else if (pBoundary >= BOUNDARY_THRESHOLD && t - this.songStart >= MIN_SONG_MS) {
      this.startSong(t, this.beatsThisSong >= SONG_MIN_BEATS, true)
    } else {
      this.trackStop(t)
      this.phraseOffset = this.phraseLineOffset(row)
      this.decode(t, pBuild, pBreak, pDrop)
    }
    this.checkSongPlaying(t)

    const shown = this.show(t, row, silence)
    if (shown !== this.shownSection) {
      this.shownSection = shown
      this.shownStart = t
    }
    slot.section = shown
    const confidence = shown === 'buildup' || shown === 'turnaround' ? this.smoothed[1]! : shown === 'break' ? this.smoothed[2]! : 1
    this.state = {
      section: shown,
      intensity: this.intensity(t),
      buildupProgress: shown === 'buildup' ? clamp01((t - this.sectionStart) / BUILDUP_TYPICAL_MS) : 0,
      sinceMs: t - this.shownStart,
      songIndex: this.songIndex,
      songMs: this.songConfirmed && this.songStart !== null ? t - this.songStart : null,
      dropCount: this.dropCount,
      sinceDropMs: Number.isFinite(this.lastDrop) ? t - this.lastDrop : null,
      confidence: Math.round(confidence * 100) / 100,
    }
  }

  // Stage 1 (build, break), its short memory, stage 2 (drop) and the boundary model. Returns [build, break, drop, boundary].
  private runModel = (row: Float64Array): [number, number, number, number] => {
    const p1 = softmaxInPlace(boosterScores(this.model.stage1, row, this.scores))
    const [pOther = 1, pBuild = 0, pBreak = 0] = p1
    const alpha = this.smoothedReady ? 1 - Math.exp(-SLOT_MS / 1000 / SMOOTH_S) : 1
    this.smoothed[0]! += (pOther - this.smoothed[0]!) * alpha
    this.smoothed[1]! += (pBuild - this.smoothed[1]!) * alpha
    this.smoothed[2]! += (pBreak - this.smoothed[2]!) * alpha
    this.smoothedReady = true

    this.memoryBuild.push(pBuild)
    this.memoryBreak.push(pBreak)
    const longest = Math.max(...this.model.memorySeconds) * 4
    if (this.memoryBuild.length > longest) {
      this.memoryBuild.shift()
      this.memoryBreak.shift()
    }
    const input = this.stage2Input
    const count = this.model.features.length
    input.set(row.subarray(0, count), 0)
    input[count] = pOther
    input[count + 1] = pBuild
    input[count + 2] = pBreak
    let at = count + 3
    this.model.memorySeconds.forEach((seconds) => {
      const window = seconds * 4
      for (const memory of [this.memoryBuild, this.memoryBreak]) {
        let sum = 0
        let top = 0
        const from = Math.max(0, memory.length - window)
        for (let k = from; k < memory.length; k++) {
          sum += memory[k]!
          top = Math.max(top, memory[k]!)
        }
        input[at++] = sum / (memory.length - from)
        input[at++] = top
      }
    })
    const pDrop = sigmoid(boosterScores(this.model.stage2, input, this.scores)[0]!)
    const pBoundary = this.model.boundary ? sigmoid(boosterScores(this.model.boundary, row, this.scores)[0]!) : 0
    return [this.smoothed[1]!, this.smoothed[2]!, pDrop, pBoundary]
  }

  // Stops, and the turnaround: a stop during a buildup or just after one, until the music comes back, the drop lands or it lasts too long.
  private trackStop = (t: number): void => {
    const { total, bass } = this.features.getLastSlot()
    const tune = this.tuning
    if (this.decoded === 'buildup') this.lastBuildup = t
    if (this.turnaroundStart !== null) {
      if (total > tune.turnaroundLeaveDb) {
        this.turnaroundStart = null
        this.lastTurnaroundEnd = t
      } else if (t - this.turnaroundStart > tune.turnaroundMaxMs) {
        this.turnaroundStart = null
      }
      return
    }
    const stopped = total <= tune.stopTotalDb && bass <= tune.stopBassDb
    if (!stopped && this.stopRun >= tune.stopSlots) this.lastFillEnd = t
    this.stopRun = stopped ? this.stopRun + 1 : 0
    if (this.stopRun >= tune.stopSlots && t - this.lastBuildup <= tune.turnaroundAfterBuildupMs && t - this.lastDrop >= DROP_REFRACTORY_MS) {
      this.turnaroundStart = t - (this.stopRun - 1) * SLOT_MS
      this.stopRun = 0
    }
  }

  // How much the drop threshold moves for where the grid puts this slot in the 8-bar phrase (0 with no locked grid).
  private phraseLineOffset = (row: Float64Array): number => {
    const tune = this.tuning
    if (row[F_GRID_LOCKED]! <= 0 || row[F_PHRASE_CONFIDENCE]! < tune.phraseLineMinConfidence) return 0
    const into = row[F_INTO_PHRASE]!
    return Math.min(into, BEATS_PER_PHRASE - into) <= tune.phraseLineBeats ? tune.phraseLineDropOffset : tune.offPhraseDropOffset
  }

  private dropThreshold = (t: number): number => this.baseDropThreshold(t) + this.phraseOffset

  private baseDropThreshold = (t: number): number => {
    const tune = this.tuning
    const turnaround = this.turnaroundStart !== null || t - this.lastTurnaroundEnd <= tune.turnaroundDropWindowMs
    if (turnaround && tune.turnaroundDropThreshold !== null) return tune.turnaroundDropThreshold
    if (t - this.lastFillEnd <= tune.turnaroundDropWindowMs && tune.fillDropThreshold !== null) return tune.fillDropThreshold
    return t - this.lastSetup <= DROP_CONTEXT_MS ? tune.dropContextThreshold : tune.dropThreshold
  }

  // The state machine over the smoothed probabilities. Mirrors decode.py (which has no turnaround).
  private decode = (t: number, pBuild: number, pBreak: number, pDrop: number): void => {
    const songAge = t - (this.songStart ?? t)
    if (this.decoded === 'buildup' || this.decoded === 'break') this.lastSetup = t
    const threshold = this.dropThreshold(t)
    if (pDrop >= threshold && t - this.lastDrop >= DROP_REFRACTORY_MS && songAge >= NO_DROP_BEFORE_MS) {
      this.turnaroundStart = null
      this.lastDrop = t
      this.dropCount++
      this.hadBuildupOrDrop = true
      this.enter('drop', t)
      this.buildRun = 0
      this.breakRun = 0
      return
    }
    this.buildRun = pBuild >= BUILDUP_IN ? this.buildRun + 1 : 0
    this.breakRun = pBreak >= BREAK_IN ? this.breakRun + 1 : 0
    if (this.decoded === 'buildup' && pBuild < BUILDUP_OUT) this.enter(this.afterSetup(t), t)
    else if (this.decoded === 'break' && pBreak < BREAK_OUT) this.enter(this.afterSetup(t), t)
    if (this.decoded === 'groove' || this.decoded === 'drop') {
      // The likelier of the two, once it has held for long enough.
      if (pBuild >= pBreak) {
        if (this.buildRun >= ENTER_SLOTS) this.enter('buildup', t)
      } else if (this.breakRun >= ENTER_SLOTS) {
        this.enter('break', t)
      }
    } else if (this.decoded === 'break' && this.buildRun >= ENTER_SLOTS && pBuild > pBreak) {
      this.enter('buildup', t)
    } else if (this.decoded === 'buildup' && this.breakRun >= ENTER_SLOTS && pBreak > pBuild + SWITCH_MARGIN) {
      this.enter('break', t)
    }
    if (this.decoded === 'buildup') this.hadBuildupOrDrop = true
    if (this.decoded === 'drop' && t - this.sectionStart >= DROP_SECTION_MAX_MS) this.enter('groove', t)
  }

  // A buildup or break that ends without a drop goes back to the drop it interrupted (if that was recent) or to groove.
  private afterSetup = (t: number): Decoded => (t - this.lastDrop < DROP_SECTION_MAX_MS ? 'drop' : 'groove')

  private enter = (section: Decoded, t: number): void => {
    if (section === this.decoded) return
    this.decoded = section
    this.sectionStart = t
  }

  // What is shown: the decoded section, with the song-level rules on top.
  private show = (t: number, row: Float64Array, silence: number): SongSection => {
    if (!this.songConfirmed) return 'quiet'
    // A turnaround is often near silence for a second or two; it is still the end of the buildup, not a quiet passage.
    if (this.turnaroundStart !== null) return 'turnaround'
    if (silence >= SILENCE_SHOWN_S) return 'quiet'
    const songAge = t - (this.songStart ?? t)
    // An outro: a fade late in a song that has had its drop. It ends if the level comes back.
    const level = row[F_REL_TOTAL]!
    const falling = (row[F_SLOPE16_MID]! + row[F_SLOPE16_LO]!) / 2 <= OUTRO_SLOPE_DB_S
    if (this.outro && level >= OUTRO_LEAVE_DB) this.outro = false
    if (!this.outro && this.dropCount > 0 && songAge >= OUTRO_MIN_SONG_MS && level <= OUTRO_LEVEL_DB && falling && this.decoded !== 'buildup') {
      this.outro = true
    }
    if (this.outro) return 'outro'
    // The start of a song, before anything has built or dropped, is its intro (a break-like opening included).
    if (!this.hadBuildupOrDrop && songAge < INTRO_MAX_MS && this.decoded !== 'buildup') return 'intro'
    return this.decoded
  }

  // A song starts: features, decoder and clock start over. `counts` is whether the song that just ended was a real song.
  private startSong = (t: number, counts: boolean, continuous: boolean): void => {
    if (counts) this.songIndex++
    this.features = new SectionFeatures()
    this.songStart = t
    this.songConfirmed = continuous && this.songConfirmed
    this.confirmSlots = 0
    this.beatsThisSong = 0
    this.silenceBoundary = false
    this.smoothedReady = false
    this.memoryBuild.length = 0
    this.memoryBreak.length = 0
    this.decoded = 'groove'
    this.sectionStart = t
    this.buildRun = 0
    this.breakRun = 0
    this.lastDrop = -Infinity
    this.lastSetup = -Infinity
    this.lastBuildup = -Infinity
    this.turnaroundStart = null
    this.lastTurnaroundEnd = -Infinity
    this.lastFillEnd = -Infinity
    this.stopRun = 0
    this.dropCount = 0
    this.hadBuildupOrDrop = false
    this.outro = false
  }

  // A song is playing when a regular beat has been going: enough beats lately and a steady tempo. A fan, a keyboard or one-off noise has neither.
  private checkSongPlaying = (t: number): void => {
    this.confirmSlots++
    if (this.confirmSlots < SONG_CONFIRM_CHECK_SLOTS) return
    this.confirmSlots = 0
    if (this.songStart === null) return
    if (this.songConfirmed) {
      const lately = this.beatTimes.filter((time) => t - time <= SONG_LOST_MS).length
      if (lately < SONG_LOST_BEATS) this.songConfirmed = false
      return
    }
    if (t - this.songStart < SONG_CONFIRM_MS) return
    const recent = this.beatTimes.filter((time) => t - time <= SONG_CONFIRM_WINDOW_MS)
    if (recent.length < SONG_CONFIRM_BEATS) return
    const reading = estimateTempo(recent)
    this.songConfirmed = reading !== null && reading.consistency >= SONG_CONFIRM_CONSISTENCY
  }

  private intensity = (now: number): number => {
    let recent = 0
    let count = 0
    let peak = 0
    for (let i = this.slots.length - 1; i >= 0; i--) {
      const slot = this.slots[i]!
      const age = now - slot.t
      if (age >= 60000) break
      if (age < 2000) {
        recent += slot.total
        count++
      }
      peak = Math.max(peak, slot.total)
    }
    if (count === 0 || peak <= 0) return 0
    return clamp01((toDb(recent / count) - toDb(peak) + 18) / 18)
  }
}

export const sectionTracker = new SectionTracker()
