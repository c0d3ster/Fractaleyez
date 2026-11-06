// Labels the current part of a song (intro, groove, buildup, break, drop, outro, quiet) from slow features of the band levels.
// Everything is judged against the song's own levels (its 90th percentile over the last 90 s, or its recent trend), never absolute
// levels, so a quiet mic and a loud feed behave the same. The clock comes in with each sample, so the tracker is pure and testable.
//
// What a section looks like in the band levels (the loudness of modern tracks is nearly flat, so it is the changes that count):
//  - a buildup is a sustained climb: a straight-ish rise of one frequency group over several seconds (a regression slope with a good
//    fit, not a recent-versus-earlier comparison, which fires on the pumping of a sidechained mix)
//  - a break is the low end sitting well under its own peak
//  - a drop is the step back up to the peak after a buildup, break or quiet stretch
//  - an intro is a climb at the start of a song, an outro a long fall near the end
import { estimateTempo } from './tempo'

export type SongSection = 'intro' | 'quiet' | 'groove' | 'buildup' | 'break' | 'drop' | 'outro'

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
}

export type SectionSample = {
  t: number
  /** Band levels (% of full scale), in ONSET_BANDS order: bass, lo, mid, hi, air. */
  levels: readonly number[]
  /** True on the frame a beat was detected. */
  beat: boolean
}

/** One closed slot of the long history, with the section that was current when it closed. */
export type SectionSlot = {
  t: number
  total: number
  low: number
  mid: number
  high: number
  beats: number
  section: SongSection
}

const SLOT_MS = 250
const HISTORY_MS = 120000
// Every closed slot is also kept for this long (40 minutes, about 9600 slots), so a listening session can be exported and replayed offline.
const RECORDING_SLOTS = 9600
const RECORDING_TRIM = 1200
const PEAK_WINDOW_MS = 60000
// The song's loudness memory: it jumps up at once and forgets slowly. Used for silence and quiet, which are about the whole level.
const REFERENCE_RELEASE_TAU_MS = 45000
// Needs this much song before it calls a break, outro or drop: the first stretch is mostly an intro ramping up from silence.
const MIN_HISTORY_MS = 20000
const RECENT_MS = 2000
// Long enough to hold a few kicks, so a single hit against a quieter average does not read as the low end coming back.
const FINE_MS = 1000
const BEFORE_FROM_MS = 1500
const BEFORE_TO_MS = 5000

// A song's own top level: the 90th percentile of what each group did over the last 90 s of this song.
const PEAK_REF_MS = 90000
const PEAK_PERCENTILE = 0.9
// A climb or a fall: a line fitted to six one-second means. It has to be steep enough, straight enough (the fit, 0 to 1) and big enough in total.
const TREND_SECONDS = 6
const TREND_MIN_SONG_MS = 8000
const TREND_SLOPE_DB_S = 0.45
const TREND_MIN_FIT = 0.6
const TREND_MIN_DB = 3
// A ramp spreads its rise over the window; a step (the drop itself, a cut) puts most of it into one second and is not a climb.
const CLIMB_MAX_STEP_SHARE = 0.5
// A buildup is a longer and bigger climb than the ones a groove makes coming back from a dip (those last a few seconds, builds last bars).
const BUILDUP_SECONDS = 9
const BUILDUP_MIN_DB = 6
// A very straight 6 s climb is a buildup too, found earlier than the 9 s one: a dip recovering is not that straight.
const BUILDUP_QUICK_MIN_DB = 5
const BUILDUP_QUICK_FIT = 0.88

// An intro is a climb at the start of a song, and a big one: a few dB of drift in the first seconds is not an intro.
const INTRO_WINDOW_MS = 45000
const INTRO_MIN_DB = 6
const INTRO_LAPSE_SLOTS = 8
// An intro that is still climbing past this is the song's first buildup, and the intro was the part before it.
const INTRO_MAX_MS = 30000

// It takes this long, with a regular beat going, to believe a song is playing. Silence, stray noise and typing do not get a song time.
const SONG_CONFIRM_MS = 10000
const SONG_CONFIRM_WINDOW_MS = 8000
const SONG_CONFIRM_BEATS = 8
const SONG_CONFIRM_CONSISTENCY = 0.5
const SONG_CONFIRM_CHECK_SLOTS = 8
// A confirmed song that has had almost no beats for this long is not playing any more.
const SONG_LOST_MS = 25000
const SONG_LOST_BEATS = 2

// Silence is much deeper than quiet: a paused player or a gap between songs, not a soft bridge. It is judged from its real start (not from when it
// was noticed), works from the first seconds of a song, and any stretch of it this long separates two songs.
const SILENCE_DB = -24
// Mean level (% of full scale) under which it is silence whatever the song was doing, for a feed that is digitally silent.
const SILENCE_ABS = 0.05
const SILENCE_NEW_SONG_MS = 5000
// A moment of sound, not a click, before the silence is over.
const SILENCE_RETURN_SLOTS = 2
// A "song" with fewer beats than this was never really a song (the app opened on silence or stray noise), so the next one is not a second song.
const SONG_MIN_BEATS = 6

const QUIET_ENTER_DB = -14
const QUIET_LEAVE_DB = -8
const QUIET_ENTER_SLOTS = 4
const QUIET_MIN_MS = 3000
// Coming out of a quiet stretch this long is a new song, not a bridge.
const NEW_SONG_AFTER_QUIET_MS = 10000

// An outro is a long, deep fall late in a song. A fall alone cannot tell a break from the end (a late break drops 7 to 9 dB and comes back), so
// an outro has to go much lower than a break does; shallower than this it stays a break, and the next song is still found when it starts.
const OUTRO_MIN_SONG_MS = 150000
const OUTRO_REL_DB = -12
// A fade that comes back up within this long was a pause after all, and the song goes on; later than that, the next song has started.
const OUTRO_FALSE_ALARM_MS = 8000
const OUTRO_LEAVE_DB = -3
// During an outro, a climb this far over its quietest point means the next song is starting even if it opens quietly.
const OUTRO_NEXT_SONG_RISE_RATIO = 2.5

// A break: the low end well under its peak (or the whole song well under it), steady for a few seconds, and back up for a couple to leave.
const BREAK_LOW_DB = -4
const BREAK_TOTAL_DB = -3.5
const BREAK_ENTER_SLOTS = 16
// The low end of a wobbling bass dips 4 to 6 dB for a second or two inside a drop. A break is judged on this longer mean, so a wobble cannot start one,
// and a drop is followed by a stretch where no break can start (and no second drop), which is what stops the break, drop, groove, break, drop loop.
const BREAK_MEAN_MS = 4000
const BREAK_AFTER_DROP_MS = 10000
const DROP_REFRACTORY_MS = 8000
const BREAK_LEAVE_LOW_DB = -2.5
const BREAK_LEAVE_TOTAL_DB = -2
const BREAK_LEAVE_SLOTS = 8
const BREAK_MIN_MS = 3000

// A buildup: a climb in the mids, highs or the whole, held for about a second. It ends when the climb has gone for a few seconds, or after this long.
const BUILDUP_ENTER_SLOTS = 4
// The turnaround before a drop (a stop, a rest) ends the climb a few seconds early, so the buildup lingers a bit after it.
const BUILDUP_LOST_SLOTS = 16
const BUILDUP_MAX_MS = 30000
const BUILDUP_TYPICAL_MS = 12000
// Right after a drop the song settles; a climb then is not a new buildup.
const BUILDUP_AFTER_DROP_MS = 8000

const DROP_LOW_JUMP_DB = 6
const DROP_TOTAL_JUMP_DB = 4
const DROP_HIGH_JUMP_DB = 8
const DROP_MIN_REL_DB = -3.5
// A step this big is a drop whether or not a buildup or break was labelled first (the label may have lapsed in the turnaround, or been an intro).
const DROP_STRONG_EXTRA_DB = 3
const DROP_HOLD_MS = 4000
// A drop can follow a buildup, break, quiet stretch or fade that ended just before, and only a real one: one that lasted a moment is not a setup.
const DROP_LOOKBACK_MS = 6000
const DROP_AFTER_BUILDUP_MIN_MS = 2500
const DROP_AFTER_BREAK_MIN_MS = 3000
const DROP_AFTER_QUIET_MIN_MS = 2000
const DROP_AFTER_OUTRO_MIN_MS = 2000

// A different tempo from the one this song has held, over a few readings, means a different song, even with no outro (a blend, a cut).
// One estimate per check costs about a millisecond, so it is read every few seconds, never every frame.
const TEMPO_CHECK_SLOTS = 16
const BEAT_MEMORY_MS = 30000
const TEMPO_RECENT_MS = 12000
const TEMPO_CHANGE = 0.08
// The tempo estimate wobbles on real music (a steady 128 BPM track reads 96, 127, 160, 176 along the way, at consistency 0.4 to 0.7), so a change
// only counts when the reading is clean and stays different for several checks in a row.
const TEMPO_CHANGE_CHECKS = 3
const TEMPO_MIN_CONSISTENCY = 0.75
// Half time, double time and triplet feel read as the same tempo.
const TEMPO_SAME_RATIOS = [0.5, 2 / 3, 1, 1.5, 2]
// A song change from tempo needs a song that has been going this long, so the first readings are not compared with a previous song's beats.
const TEMPO_MIN_SONG_MS = 40000

const FLOOR = 1e-3
const toDb = (value: number): number => 20 * Math.log10(Math.max(value, FLOOR))
const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))

type SetupSection = 'buildup' | 'break' | 'quiet' | 'outro'
const SETUP_MIN_MS: Record<SetupSection, number> = {
  buildup: DROP_AFTER_BUILDUP_MIN_MS,
  break: DROP_AFTER_BREAK_MIN_MS,
  quiet: DROP_AFTER_QUIET_MIN_MS,
  outro: DROP_AFTER_OUTRO_MIN_MS,
}
const isSetup = (section: SongSection): section is SetupSection =>
  section === 'buildup' || section === 'break' || section === 'quiet' || section === 'outro'

type Group = 'total' | 'low' | 'mid' | 'high'
type Levels = { total: number; low: number; high: number }
type Trend = { slope: number; fit: number; rise: number; /** The biggest rise between two neighbouring seconds: a step puts most of the total into one. */ maxStep: number }

const sameTempo = (a: number, b: number): boolean => TEMPO_SAME_RATIOS.some((ratio) => Math.abs(b / a / ratio - 1) <= TEMPO_CHANGE)

const isClimb = (trend: Trend | null, minDb: number = TREND_MIN_DB, minFit: number = TREND_MIN_FIT): boolean =>
  trend !== null &&
  trend.slope >= TREND_SLOPE_DB_S &&
  trend.fit >= minFit &&
  trend.rise >= minDb &&
  trend.maxStep <= trend.rise * CLIMB_MAX_STEP_SHARE

const isFall = (trend: Trend | null): boolean =>
  trend !== null && trend.slope <= -TREND_SLOPE_DB_S && trend.fit >= TREND_MIN_FIT && trend.rise <= -TREND_MIN_DB

export class SectionTracker {
  private readonly slots: SectionSlot[] = []
  private recording: SectionSlot[] = []
  private beatTimes: number[] = []
  private slotStart: number | null = null
  private songStart: number | null = null
  private sums = { total: 0, low: 0, mid: 0, high: 0 }
  private frames = 0
  private beats = 0
  private reference: Levels = { total: 0, low: 0, high: 0 }
  private section: SongSection = 'groove'
  private sectionStart = 0
  private songIndex = 1
  private songConfirmed = false
  private confirmSlots = 0
  private beatsThisSong = 0
  private silentSince: number | null = null
  private silenceBoundary = false
  private soundSlots = 0
  private introDone = false
  private introLapse = 0
  private outroFloor = Infinity
  private outroSeen = false
  private lastSetupEnd = -Infinity
  private lastSetupLongEnough = false
  private lastDropEnd = -Infinity
  private lastDropStart = -Infinity
  private risingSlots = 0
  private lostSlots = 0
  private breakSlots = 0
  private breakLeaveSlots = 0
  private quietSlots = 0
  private tempoSlots = 0
  private tempoChanges = 0
  private songTempo: number | null = null
  private state: SectionState = { section: 'quiet', intensity: 0, buildupProgress: 0, sinceMs: 0, songIndex: 1, songMs: null }

  push = ({ t, levels, beat }: SectionSample): void => {
    if (this.slotStart === null) {
      this.slotStart = t
      this.sectionStart = t
    }
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

    if (t - this.slotStart < SLOT_MS) return
    this.closeSlot(t)
  }

  getState = (): SectionState => this.state

  /** Every slot since the tracker started (the last 40 minutes at most), with the section that was shown for it. Not a copy: read it where it is called. */
  getRecording = (): readonly SectionSlot[] => this.recording

  /** The closed slots, oldest first. Not a copy: read it where it is called. */
  getHistory = (): readonly SectionSlot[] => this.slots

  reset = (): void => {
    this.slots.length = 0
    this.recording = []
    this.beatTimes = []
    this.slotStart = null
    this.songStart = null
    this.sums = { total: 0, low: 0, mid: 0, high: 0 }
    this.frames = 0
    this.beats = 0
    this.reference = { total: 0, low: 0, high: 0 }
    this.section = 'groove'
    this.sectionStart = 0
    this.songIndex = 1
    this.songConfirmed = false
    this.confirmSlots = 0
    this.beatsThisSong = 0
    this.silentSince = null
    this.silenceBoundary = false
    this.soundSlots = 0
    this.introDone = false
    this.introLapse = 0
    this.outroFloor = Infinity
    this.outroSeen = false
    this.lastSetupEnd = -Infinity
    this.lastSetupLongEnough = false
    this.lastDropEnd = -Infinity
    this.lastDropStart = -Infinity
    this.risingSlots = 0
    this.lostSlots = 0
    this.breakSlots = 0
    this.breakLeaveSlots = 0
    this.quietSlots = 0
    this.tempoSlots = 0
    this.tempoChanges = 0
    this.songTempo = null
    this.state = { section: 'quiet', intensity: 0, buildupProgress: 0, sinceMs: 0, songIndex: 1, songMs: null }
  }

  private closeSlot = (t: number): void => {
    const frames = Math.max(this.frames, 1)
    const slot: SectionSlot = {
      t,
      total: this.sums.total / frames,
      low: this.sums.low / frames,
      mid: this.sums.mid / frames,
      high: this.sums.high / frames,
      beats: this.beats,
      section: this.section,
    }
    this.sums = { total: 0, low: 0, mid: 0, high: 0 }
    this.frames = 0
    this.beats = 0
    this.slotStart = t

    // A long gap between samples (the tab was in the background) is a fresh start, not a song that went quiet.
    const previous = this.slots[this.slots.length - 1]
    if (!previous || t - previous.t > HISTORY_MS) {
      this.beginSong(t, { total: 0, low: 0, high: 0 }, 'groove')
      this.songIndex = previous ? this.songIndex + 1 : 1
      slot.section = 'groove'
    }
    this.slots.push(slot)
    const oldest = this.slots.findIndex((s) => t - s.t <= HISTORY_MS)
    if (oldest > 0) this.slots.splice(0, oldest)
    const oldestBeat = this.beatTimes.findIndex((time) => t - time <= BEAT_MEMORY_MS)
    if (oldestBeat > 0) this.beatTimes.splice(0, oldestBeat)
    else if (oldestBeat < 0) this.beatTimes = []
    this.updateReference(slot)

    if (!this.handleSilence(t, slot)) this.evaluate(t)
    this.checkSongPlaying(t)
    slot.section = this.shown()
    this.recording.push(slot)
    if (this.recording.length > RECORDING_SLOTS) this.recording.splice(0, RECORDING_TRIM)
    this.state = {
      section: this.shown(),
      intensity: this.intensity(t),
      buildupProgress: this.section === 'buildup' ? clamp01((t - this.sectionStart) / BUILDUP_TYPICAL_MS) : 0,
      sinceMs: t - this.sectionStart,
      songIndex: this.songIndex,
      songMs: this.songConfirmed && this.songStart !== null ? t - this.songStart : null,
    }
  }

  // With no regular beat going (silence, a fan, typing on a keyboard) there is no song to have parts, so it shows as quiet rather than groove.
  private shown = (): SongSection => (this.songConfirmed ? this.section : 'quiet')

  private updateReference = (slot: SectionSlot): void => {
    const release = 1 - Math.exp(-SLOT_MS / REFERENCE_RELEASE_TAU_MS)
    const follow = (reference: number, value: number): number => (value >= reference ? value : reference + (value - reference) * release)
    this.reference = {
      total: follow(this.reference.total, slot.total),
      low: follow(this.reference.low, slot.low),
      high: follow(this.reference.high, slot.high),
    }
  }

  // Mean of a feature over slots whose age is between `fromAge` and `toAge` (ms before `now`), or null if there are none.
  private mean = (now: number, fromAge: number, toAge: number, pick: Group): number | null => {
    let sum = 0
    let count = 0
    for (let i = this.slots.length - 1; i >= 0; i--) {
      const slot = this.slots[i]!
      const age = now - slot.t
      if (age >= toAge) break
      if (age < fromAge) continue
      sum += slot[pick]
      count++
    }
    return count === 0 ? null : sum / count
  }

  private meanDb = (now: number, fromAge: number, toAge: number, pick: Group): number | null => {
    const value = this.mean(now, fromAge, toAge, pick)
    return value === null ? null : toDb(value)
  }

  // A line fitted to the last few seconds of one group's level (one mean per second, in dB): how steeply it climbs, how straight that line is, and how far it went.
  private trend = (now: number, pick: Group, seconds: number = TREND_SECONDS): Trend | null => {
    const bins: number[] = []
    for (let i = 0; i < seconds; i++) {
      const db = this.meanDb(now, (seconds - 1 - i) * 1000, (seconds - i) * 1000, pick)
      if (db === null) return null
      bins.push(db)
    }
    const n = bins.length
    const meanX = (n - 1) / 2
    const meanY = bins.reduce((sum, y) => sum + y, 0) / n
    let sxy = 0
    let sxx = 0
    let syy = 0
    bins.forEach((y, x) => {
      sxy += (x - meanX) * (y - meanY)
      sxx += (x - meanX) ** 2
      syy += (y - meanY) ** 2
    })
    const slope = sxy / sxx
    const fit = syy === 0 ? 0 : (sxy * sxy) / (sxx * syy)
    let maxStep = 0
    for (let i = 1; i < n; i++) maxStep = Math.max(maxStep, bins[i]! - bins[i - 1]!)
    return { slope, fit, rise: slope * (n - 1), maxStep }
  }

  // The 90th percentile of a group's level over this song's last 90 s, in dB: the level the song is "at" when it is full. It is taken over 2 s means
  // (the same span `relative` measures the present with), so the pumping of a sidechained kick does not lift the top and make every groove look low.
  private peakDb = (now: number, pick: Group): number | null => {
    const linear: number[] = []
    for (let i = this.slots.length - 1; i >= 0; i--) {
      const slot = this.slots[i]!
      if (now - slot.t > PEAK_REF_MS || (this.songStart !== null && slot.t < this.songStart)) break
      linear.push(slot[pick])
    }
    if (linear.length === 0) return null
    const box = Math.max(1, Math.min(linear.length, RECENT_MS / SLOT_MS))
    const smoothed: number[] = []
    let sum = 0
    for (let i = 0; i < linear.length; i++) {
      sum += linear[i]!
      if (i >= box) sum -= linear[i - box]!
      if (i >= box - 1) smoothed.push(toDb(sum / box))
    }
    smoothed.sort((x, y) => x - y)
    return smoothed[Math.min(smoothed.length - 1, Math.floor(smoothed.length * PEAK_PERCENTILE))] ?? null
  }

  // Where a group's level is now (the last 2 s) against the song's own top level, in dB: 0 at the top, negative below it.
  private relative = (now: number, pick: Group, windowMs: number = RECENT_MS): number | null => {
    const recent = this.meanDb(now, 0, windowMs, pick)
    const peak = this.peakDb(now, pick)
    return recent === null || peak === null ? null : recent - peak
  }

  private intensity = (now: number): number => {
    const recent = this.mean(now, 0, RECENT_MS, 'total')
    if (recent === null) return 0
    let peak = 0
    for (let i = this.slots.length - 1; i >= 0 && now - this.slots[i]!.t < PEAK_WINDOW_MS; i--) peak = Math.max(peak, this.slots[i]!.total)
    return peak <= 0 ? 0 : clamp01((toDb(recent) - toDb(peak) + 18) / 18)
  }

  private enter = (section: SongSection, t: number): void => {
    if (section === this.section) return
    if (this.section === 'drop') this.lastDropEnd = t
    if (section === 'drop') this.lastDropStart = t
    if (isSetup(this.section)) {
      this.lastSetupEnd = t
      this.lastSetupLongEnough = t - this.sectionStart >= SETUP_MIN_MS[this.section]
    }
    if (section === 'outro') {
      this.outroSeen = true
      this.outroFloor = Infinity
    }
    if (section === 'groove' && this.section === 'outro') this.outroSeen = false
    this.section = section
    this.sectionStart = t
    this.risingSlots = 0
    this.lostSlots = 0
    this.breakSlots = 0
    this.breakLeaveSlots = 0
    this.quietSlots = 0
  }

  // A song starts: the loudness memory is reset to where it is now (the old song's levels say nothing about the new one), and nothing
  // is compared across the boundary until it has some history of its own.
  private beginSong = (t: number, levels: Levels, section: SongSection, continuous: boolean = false): void => {
    this.songStart = t
    // Music that carries straight on (an outro into the next song, a change of tempo) is still music; after silence a song has to be heard again.
    this.songConfirmed = continuous && this.songConfirmed
    this.confirmSlots = 0
    this.beatsThisSong = 0
    this.silentSince = null
    this.silenceBoundary = false
    this.soundSlots = 0
    this.reference = { ...levels }
    this.introDone = false
    this.introLapse = 0
    this.outroSeen = false
    this.outroFloor = Infinity
    this.lastSetupEnd = -Infinity
    this.lastSetupLongEnough = false
    this.lastDropEnd = -Infinity
    this.lastDropStart = -Infinity
    this.tempoSlots = 0
    this.tempoChanges = 0
    this.songTempo = null
    this.section = section
    this.sectionStart = t
    this.risingSlots = 0
    this.lostSlots = 0
    this.breakSlots = 0
    this.breakLeaveSlots = 0
    this.quietSlots = 0
  }

  private startNextSong = (t: number, levels?: Levels, continuous: boolean = true): void => {
    // The app opening on silence and then music is the first song, not the second.
    if (this.beatsThisSong >= SONG_MIN_BEATS) this.songIndex++
    this.beginSong(
      t,
      levels ?? {
        total: this.mean(t, 0, RECENT_MS, 'total') ?? 0,
        low: this.mean(t, 0, RECENT_MS, 'low') ?? 0,
        high: this.mean(t, 0, RECENT_MS, 'high') ?? 0,
      },
      'intro',
      continuous,
    )
  }

  // Silence long enough to separate songs. Returns true while it holds the tracker (nothing else is judged in silence, or on the slot that ends it).
  private handleSilence = (t: number, slot: SectionSlot): boolean => {
    const silent = slot.total < SILENCE_ABS || toDb(slot.total) - toDb(this.reference.total) < SILENCE_DB
    if (silent) {
      this.soundSlots = 0
      this.silentSince ??= t - SLOT_MS
      if (!this.silenceBoundary && t - this.silentSince >= SILENCE_NEW_SONG_MS) {
        this.silenceBoundary = true
        this.enter('quiet', t)
        this.sectionStart = this.silentSince
        this.songConfirmed = false
      }
      return this.silenceBoundary
    }
    if (this.silentSince === null) return false
    if (!this.silenceBoundary) {
      this.silentSince = null
      return false
    }
    this.soundSlots++
    if (this.soundSlots < SILENCE_RETURN_SLOTS) return true
    this.startNextSong(t, { total: slot.total, low: slot.low, high: slot.high }, false)
    return true
  }

  // True when a buildup, break, quiet stretch or fade is on, or just ended, and ran long enough to be the setup for a drop.
  private setsUpDrop = (t: number): boolean => {
    if (isSetup(this.section)) return t - this.sectionStart >= SETUP_MIN_MS[this.section]
    return this.lastSetupLongEnough && t - this.lastSetupEnd <= DROP_LOOKBACK_MS
  }

  // A song is playing when a regular beat has been going: enough beats lately and a steady tempo. A fan, a keyboard or one-off noise has neither.
  private checkSongPlaying = (t: number): void => {
    this.confirmSlots++
    if (this.confirmSlots < SONG_CONFIRM_CHECK_SLOTS) return
    this.confirmSlots = 0
    if (this.songStart === null) return
    if (this.songConfirmed) {
      const lately = this.beatTimes.filter((time) => t - time <= SONG_LOST_MS).length
      if (lately < SONG_LOST_BEATS && this.section !== 'quiet') this.songConfirmed = false
      return
    }
    if (this.section === 'quiet' || t - this.songStart < SONG_CONFIRM_MS) return
    const recent = this.beatTimes.filter((time) => t - time <= SONG_CONFIRM_WINDOW_MS)
    if (recent.length < SONG_CONFIRM_BEATS) return
    const reading = estimateTempo(recent)
    this.songConfirmed = reading !== null && reading.consistency >= SONG_CONFIRM_CONSISTENCY
  }

  // The song's held tempo follows readings that agree with it; readings that stay different from it for a couple of checks in a row are a new song.
  private tempoChanged = (t: number): boolean => {
    this.tempoSlots++
    if (this.tempoSlots < TEMPO_CHECK_SLOTS) return false
    this.tempoSlots = 0
    const reading = estimateTempo(this.beatTimes.filter((time) => t - time <= TEMPO_RECENT_MS))
    // A mixed window (part of it from before the change) reads as an unsteady beat, and says nothing either way.
    if (!reading || reading.consistency < TEMPO_MIN_CONSISTENCY) return false
    if (this.songTempo === null || sameTempo(this.songTempo, reading.bpm)) {
      this.songTempo = reading.bpm
      this.tempoChanges = 0
      return false
    }
    this.tempoChanges++
    return this.tempoChanges >= TEMPO_CHANGE_CHECKS
  }

  // The step back up: the low end, the whole or the highs jump well over where they were a moment ago, to near the song's top level.
  private isDropStep = (t: number, strong: boolean = false): boolean => {
    const extra = strong ? DROP_STRONG_EXTRA_DB : 0
    // The highs alone dropping out for a few seconds and coming back is a fill, not a drop, so they only count with a labelled setup before them.
    const groups: Array<[Group, number]> = [
      ['low', DROP_LOW_JUMP_DB + extra],
      ['total', DROP_TOTAL_JUMP_DB + extra],
      ...(strong ? [] : [['high', DROP_HIGH_JUMP_DB] as [Group, number]]),
    ]
    return groups.some(([group, jump]) => {
      const now = this.meanDb(t, 0, FINE_MS, group)
      const before = this.meanDb(t, BEFORE_FROM_MS, BEFORE_TO_MS, group)
      const peak = this.peakDb(t, group)
      return now !== null && before !== null && peak !== null && now - before >= jump && now - peak >= DROP_MIN_REL_DB
    })
  }

  private evaluate = (t: number): void => {
    if (this.songStart === null) this.songStart = t
    const songAge = t - this.songStart
    if (songAge < TREND_MIN_SONG_MS) return

    const totalRecent = this.mean(t, 0, RECENT_MS, 'total')
    if (totalRecent === null) return
    // Against the slow follower, for the whole level going very low (quiet, and the way out of an outro).
    const totalDb = toDb(totalRecent) - toDb(this.reference.total)

    const trendTotal = this.trend(t, 'total')
    const trendMid = this.trend(t, 'mid')
    const trendHigh = this.trend(t, 'high')
    const climbing = isClimb(trendTotal) || isClimb(trendMid) || isClimb(trendHigh)
    const buildingUp =
      isClimb(this.trend(t, 'total', BUILDUP_SECONDS), BUILDUP_MIN_DB) ||
      isClimb(this.trend(t, 'mid', BUILDUP_SECONDS), BUILDUP_MIN_DB) ||
      isClimb(this.trend(t, 'high', BUILDUP_SECONDS), BUILDUP_MIN_DB) ||
      isClimb(trendTotal, BUILDUP_QUICK_MIN_DB, BUILDUP_QUICK_FIT) ||
      isClimb(trendMid, BUILDUP_QUICK_MIN_DB, BUILDUP_QUICK_FIT) ||
      isClimb(trendHigh, BUILDUP_QUICK_MIN_DB, BUILDUP_QUICK_FIT)

    // An intro is a big climb in the first seconds of a song, and it lasts while the climb does.
    if (this.section === 'intro') {
      if (songAge >= MIN_HISTORY_MS && this.isDropStep(t, true)) {
        this.introDone = true
        this.enter('drop', t)
        return
      }
      this.introLapse = climbing ? 0 : this.introLapse + 1
      if (this.introLapse >= INTRO_LAPSE_SLOTS || t - this.sectionStart >= INTRO_MAX_MS) {
        this.introDone = true
        this.enter('groove', t)
      }
      return
    }
    if (!this.introDone) {
      if (songAge > INTRO_WINDOW_MS) this.introDone = true
      else if (isClimb(trendTotal, INTRO_MIN_DB)) {
        this.enter('intro', t)
        this.sectionStart = Math.max(this.songStart, t - TREND_SECONDS * 1000)
        this.introLapse = 0
        return
      }
    }
    if (songAge < MIN_HISTORY_MS) return

    // Quiet, with hysteresis: it takes a smaller dip to stay quiet than to become it. Coming out of a long one, or one after an outro, is the next song.
    if (this.section === 'quiet') {
      if (totalDb > QUIET_LEAVE_DB && t - this.sectionStart >= QUIET_MIN_MS) {
        if (this.outroSeen || t - this.sectionStart >= NEW_SONG_AFTER_QUIET_MS) this.startNextSong(t)
        else this.enter('groove', t)
      }
      return
    }
    this.quietSlots = totalDb < QUIET_ENTER_DB ? this.quietSlots + 1 : 0
    if (this.quietSlots >= QUIET_ENTER_SLOTS) {
      this.enter('quiet', t)
      return
    }

    // An outro: a long fall late in the song. It ends when the level comes back: soon after it began that was a pause, later it is the next song.
    if (this.section === 'outro') {
      this.outroFloor = Math.min(this.outroFloor, totalRecent)
      const longEnough = t - this.sectionStart >= OUTRO_FALSE_ALARM_MS
      if (!longEnough && t - this.lastDropStart >= DROP_REFRACTORY_MS && ((this.setsUpDrop(t) && this.isDropStep(t)) || this.isDropStep(t, true))) {
        this.enter('drop', t)
      } else if (totalDb > OUTRO_LEAVE_DB) {
        if (longEnough) this.startNextSong(t)
        else this.enter('groove', t)
      } else if (longEnough && totalRecent > this.outroFloor * OUTRO_NEXT_SONG_RISE_RATIO) {
        this.startNextSong(t)
      }
      return
    }
    const relTotal = this.relative(t, 'total')
    const relLow = this.relative(t, 'low')
    if (relTotal === null || relLow === null) return
    if (this.section !== 'drop' && songAge >= OUTRO_MIN_SONG_MS && isFall(trendTotal) && relTotal <= OUTRO_REL_DB) {
      this.enter('outro', t)
      return
    }

    // A different tempo from a few seconds ago is a different song, even with no outro to mark it.
    if (songAge >= TEMPO_MIN_SONG_MS && this.tempoChanged(t)) {
      this.startNextSong(t)
      return
    }

    // A drop: the step back up after a buildup, break or quiet stretch.
    if (this.section !== 'drop' && t - this.lastDropStart >= DROP_REFRACTORY_MS && ((this.setsUpDrop(t) && this.isDropStep(t)) || this.isDropStep(t, true))) {
      this.enter('drop', t)
      return
    }
    if (this.section === 'drop') {
      if (t - this.sectionStart >= DROP_HOLD_MS) this.enter('groove', t)
      return
    }

    if (this.section === 'buildup') {
      this.lostSlots = climbing ? 0 : this.lostSlots + 1
      if (this.lostSlots >= BUILDUP_LOST_SLOTS || t - this.sectionStart > BUILDUP_MAX_MS) this.enter('groove', t)
      return
    }

    // A buildup: a sustained climb, from a groove or from out of a break.
    const settled = t - this.lastDropEnd > BUILDUP_AFTER_DROP_MS
    this.risingSlots = buildingUp && settled ? this.risingSlots + 1 : 0
    if (this.risingSlots >= BUILDUP_ENTER_SLOTS) {
      this.enter('buildup', t)
      return
    }

    // A break takes a few seconds of the low end (or everything) well under its peak to start, and a couple of seconds back up to end.
    const relLowLong = this.relative(t, 'low', BREAK_MEAN_MS)
    const relTotalLong = this.relative(t, 'total', BREAK_MEAN_MS)
    const low = (relLowLong ?? 0) <= BREAK_LOW_DB || (relTotalLong ?? 0) <= BREAK_TOTAL_DB
    const afterDrop = t - this.lastDropStart < BREAK_AFTER_DROP_MS
    if (this.section === 'break') {
      const recovered = relLow >= BREAK_LEAVE_LOW_DB && relTotal >= BREAK_LEAVE_TOTAL_DB
      this.breakLeaveSlots = recovered ? this.breakLeaveSlots + 1 : 0
      if (this.breakLeaveSlots >= BREAK_LEAVE_SLOTS && t - this.sectionStart >= BREAK_MIN_MS) this.enter('groove', t)
      return
    }
    // Leaky, not reset: the pumping of a kick lifts a low stretch over the line for a slot now and then, and that should not start the count over.
    this.breakSlots = low && !afterDrop ? this.breakSlots + 1 : Math.max(0, this.breakSlots - 1)
    if (this.breakSlots >= BREAK_ENTER_SLOTS) this.enter('break', t)
  }
}

export const sectionTracker = new SectionTracker()
