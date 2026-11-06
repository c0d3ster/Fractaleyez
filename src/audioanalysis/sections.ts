// Labels the current part of a song (intro, groove, buildup, break, drop, outro, quiet) from slow features of the band levels.
// Everything is judged against the song's own recent loudness, never absolute levels, so a quiet mic and a loud
// feed behave the same. The clock comes in with each sample, so the tracker is pure and testable.
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
  high: number
  beats: number
  section: SongSection
}

const SLOT_MS = 250
const HISTORY_MS = 120000
const PEAK_WINDOW_MS = 60000
// The song's loudness memory: it jumps up at once and forgets slowly, so a long break is still judged against how loud the song was before it.
const REFERENCE_RELEASE_TAU_MS = 45000
// Needs this much song before it says anything but groove or intro: the first stretch is mostly an intro ramping up from silence, which is not a buildup.
const MIN_HISTORY_MS = 20000
const RECENT_MS = 2000
// Long enough to hold a few kicks, so a single hit against a quieter average does not read as the low end coming back.
const FINE_MS = 1000
const BEFORE_FROM_MS = 1500
const BEFORE_TO_MS = 5000
const RATE_RECENT_MS = 3000
const RATE_PRIOR_TO_MS = 9000

// It takes this long, with a beat going, to believe a song is playing. Silence and random spurts of noise do not get a song time.
const SONG_CONFIRM_MS = 10000
const SONG_CONFIRM_BEATS = 6
const SONG_CONFIRM_WINDOW_MS = 8000

// A song that opens from near silence: once the level has climbed this far over where it began, that start was an intro.
const START_CHECK_FROM_MS = 6000
const START_RISE_RATIO = 3
const START_WINDOW_MS = 2000
// An intro ends when the level has stopped climbing and is close to the loudest it has been, or after this long.
const INTRO_MIN_MS = 4000
const INTRO_MAX_MS = 30000
const INTRO_STABLE_DB = 3
const INTRO_DONE_OF_REF_DB = -6

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

// An outro fades everything: the whole level and the highs fall together, unlike a break, which cuts the low end and leaves the highs.
const OUTRO_TOTAL_DB = -5
const OUTRO_HIGH_DB = -6
// Real outros are long, and a pause before a drop is a few seconds: it takes about 5 s of everything fading to call it an outro.
const OUTRO_ENTER_SLOTS = 20
// A fade that comes back up within this long was a pause after all, and the song goes on; later than that, the next song has started.
const OUTRO_FALSE_ALARM_MS = 8000
const OUTRO_LEAVE_DB = -3
// During an outro, a climb this far over its quietest point means the next song is starting even if it opens quietly.
const OUTRO_NEXT_SONG_RISE_RATIO = 2.5

const BREAK_LOW_DB = -8
const BREAK_TOTAL_DB = -2.5
const BREAK_LEAVE_LOW_DB = -5.5
const BREAK_LEAVE_TOTAL_DB = -1
const BREAK_ENTER_SLOTS = 4
const BREAK_MIN_MS = 2000
const RISE_RATE_RATIO = 1.4
const RISE_RATE_MIN_DELTA = 0.75
const RISE_HIGH_DB = 3
const BUILDUP_HOLDS_ABOVE_REF_DB = -4.5
// A rise only counts when what came before it was audible: coming back up from silence is a song starting again, not a buildup.
const BUILDUP_PRIOR_ABOVE_REF_DB = -12
const BUILDUP_ENTER_SLOTS = 6
const BUILDUP_LOST_MS = 4000
const BUILDUP_MAX_MS = 40000
const BUILDUP_TYPICAL_MS = 12000
const DROP_LOW_JUMP_DB = 6
const DROP_MIN_LOW_OF_REF_DB = -3.5
const DROP_HOLD_MS = 4000
// A drop can follow a buildup or break that ended just before, and only a real one: a buildup or break that lasted a moment is not a setup.
const DROP_LOOKBACK_MS = 2500
const DROP_AFTER_BUILDUP_MIN_MS = 2500
const DROP_AFTER_BREAK_MIN_MS = 3000
const DROP_AFTER_QUIET_MIN_MS = 2000
const DROP_AFTER_OUTRO_MIN_MS = 2000

// A tempo that stays different from the one this song has held, over a few readings, means a different song, even with no outro (a blend, a cut).
// One estimate per check costs about a millisecond, so it is read every few seconds, never every frame.
const TEMPO_CHECK_SLOTS = 16
const BEAT_MEMORY_MS = 30000
const TEMPO_RECENT_MS = 12000
const TEMPO_CHANGE = 0.08
const TEMPO_CHANGE_CHECKS = 2
const TEMPO_MIN_CONSISTENCY = 0.6
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
const isSetup = (section: SongSection): section is SetupSection => section === 'buildup' || section === 'break' || section === 'quiet' || section === 'outro'

type Pick = 'total' | 'low' | 'high'
type Levels = { total: number; low: number; high: number }

const sameTempo = (a: number, b: number): boolean => TEMPO_SAME_RATIOS.some((ratio) => Math.abs(b / a / ratio - 1) <= TEMPO_CHANGE)

export class SectionTracker {
  private readonly slots: SectionSlot[] = []
  private beatTimes: number[] = []
  private slotStart: number | null = null
  private songStart: number | null = null
  private sums: Levels = { total: 0, low: 0, high: 0 }
  private frames = 0
  private beats = 0
  private reference: Levels = { total: 0, low: 0, high: 0 }
  private section: SongSection = 'groove'
  private sectionStart = 0
  private songIndex = 1
  private songConfirmed = false
  private beatsThisSong = 0
  private silentSince: number | null = null
  private silenceBoundary = false
  private soundSlots = 0
  private startChecked = false
  private outroSeen = false
  private outroFloor = Infinity
  private lastSetupEnd = -Infinity
  private lastSetupLongEnough = false
  private lastQuietEnd = -Infinity
  private risingSlots = 0
  private breakSlots = 0
  private quietSlots = 0
  private outroSlots = 0
  private tempoSlots = 0
  private tempoChanges = 0
  private songTempo: number | null = null
  private buildupStartRate = 0
  private buildupStartHigh = 0
  private buildupLostAt: number | null = null
  private state: SectionState = { section: 'groove', intensity: 0, buildupProgress: 0, sinceMs: 0, songIndex: 1, songMs: null }

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

  /** The closed slots, oldest first. Not a copy: read it where it is called. */
  getHistory = (): readonly SectionSlot[] => this.slots

  reset = (): void => {
    this.slots.length = 0
    this.beatTimes = []
    this.slotStart = null
    this.songStart = null
    this.sums = { total: 0, low: 0, high: 0 }
    this.frames = 0
    this.beats = 0
    this.reference = { total: 0, low: 0, high: 0 }
    this.section = 'groove'
    this.sectionStart = 0
    this.songIndex = 1
    this.songConfirmed = false
    this.beatsThisSong = 0
    this.silentSince = null
    this.silenceBoundary = false
    this.soundSlots = 0
    this.startChecked = false
    this.outroSeen = false
    this.outroFloor = Infinity
    this.risingSlots = 0
    this.breakSlots = 0
    this.quietSlots = 0
    this.outroSlots = 0
    this.tempoSlots = 0
    this.tempoChanges = 0
    this.songTempo = null
    this.buildupLostAt = null
    this.lastSetupEnd = -Infinity
    this.lastQuietEnd = -Infinity
    this.lastSetupLongEnough = false
    this.state = { section: 'groove', intensity: 0, buildupProgress: 0, sinceMs: 0, songIndex: 1, songMs: null }
  }

  private closeSlot = (t: number): void => {
    const frames = Math.max(this.frames, 1)
    const slot: SectionSlot = {
      t,
      total: this.sums.total / frames,
      low: this.sums.low / frames,
      high: this.sums.high / frames,
      beats: this.beats,
      section: this.section,
    }
    this.sums = { total: 0, low: 0, high: 0 }
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
    slot.section = this.section
    this.state = {
      section: this.section,
      intensity: this.intensity(t),
      buildupProgress: this.section === 'buildup' ? clamp01((t - this.sectionStart) / BUILDUP_TYPICAL_MS) : 0,
      sinceMs: t - this.sectionStart,
      songIndex: this.songIndex,
      songMs: this.songMs(t),
    }
  }

  // Counted from where the song is thought to have started. Hidden until beats have been going for a while, and again whenever it goes quiet.
  private songMs = (t: number): number | null => {
    if (this.songStart === null) return null
    const songAge = t - this.songStart
    if (this.section === 'quiet') this.songConfirmed = false
    else if (!this.songConfirmed && songAge >= SONG_CONFIRM_MS) {
      const recentBeats = this.beatTimes.filter((time) => t - time <= SONG_CONFIRM_WINDOW_MS).length
      this.songConfirmed = recentBeats >= SONG_CONFIRM_BEATS
    }
    return this.songConfirmed ? songAge : null
  }

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
  private mean = (now: number, fromAge: number, toAge: number, pick: Pick): number | null => {
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

  private rate = (now: number, fromAge: number, toAge: number): number | null => {
    let beats = 0
    let count = 0
    for (let i = this.slots.length - 1; i >= 0; i--) {
      const slot = this.slots[i]!
      const age = now - slot.t
      if (age >= toAge) break
      if (age < fromAge) continue
      beats += slot.beats
      count++
    }
    return count === 0 ? null : beats / ((count * SLOT_MS) / 1000)
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
    if (this.section === 'quiet') this.lastQuietEnd = t
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
    this.breakSlots = 0
    this.quietSlots = 0
    this.outroSlots = 0
    this.buildupLostAt = null
  }

  // A song starts: the loudness memory is reset to where it is now (the old song's levels say nothing about the new one), and nothing
  // is compared across the boundary until it has some history of its own.
  private beginSong = (t: number, levels: Levels, section: SongSection): void => {
    this.songStart = t
    this.songConfirmed = false
    this.beatsThisSong = 0
    this.silentSince = null
    this.silenceBoundary = false
    this.soundSlots = 0
    this.reference = { ...levels }
    this.startChecked = false
    this.outroSeen = false
    this.outroFloor = Infinity
    this.lastSetupEnd = -Infinity
    this.lastSetupLongEnough = false
    this.lastQuietEnd = -Infinity
    this.tempoSlots = 0
    this.tempoChanges = 0
    this.songTempo = null
    this.section = section
    this.sectionStart = t
    this.risingSlots = 0
    this.breakSlots = 0
    this.quietSlots = 0
    this.outroSlots = 0
    this.buildupLostAt = null
  }

  private startNextSong = (t: number, levels?: Levels): void => {
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
    this.startNextSong(t, { total: slot.total, low: slot.low, high: slot.high })
    return true
  }

  // True when a buildup, break or quiet stretch is on, or just ended, and ran long enough to be the setup for a drop.
  private setsUpDrop = (t: number): boolean => {
    if (isSetup(this.section)) return t - this.sectionStart >= SETUP_MIN_MS[this.section]
    return this.lastSetupLongEnough && t - this.lastSetupEnd <= DROP_LOOKBACK_MS
  }

  // Where the first seconds of the song sat against where it is now: a song that opened from near silence started with an intro.
  private checkOpenedWithIntro = (t: number, songAge: number): void => {
    if (this.startChecked || songAge < START_CHECK_FROM_MS || this.songStart === null) return
    const opening = this.mean(t, t - this.songStart - START_WINDOW_MS, t - this.songStart + SLOT_MS, 'total')
    const now = this.mean(t, 0, RECENT_MS, 'total')
    if (opening === null || now === null) return
    if (now > opening * START_RISE_RATIO) {
      this.startChecked = true
      this.enter('intro', t)
      this.sectionStart = this.songStart
    }
  }

  private updateIntro = (t: number, totalDb: number, totalRecent: number | null): void => {
    const introAge = t - this.sectionStart
    const earlier = this.mean(t, RECENT_MS, RECENT_MS + 4000, 'total')
    const stable = totalRecent !== null && earlier !== null && Math.abs(toDb(totalRecent) - toDb(earlier)) <= INTRO_STABLE_DB
    if ((introAge >= INTRO_MIN_MS && stable && totalDb >= INTRO_DONE_OF_REF_DB) || introAge >= INTRO_MAX_MS) this.enter('groove', t)
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

  private evaluate = (t: number): void => {
    if (this.songStart === null) this.songStart = t
    const songAge = t - this.songStart

    const totalRecent = this.mean(t, 0, RECENT_MS, 'total')
    const lowRecent = this.mean(t, 0, RECENT_MS, 'low')
    const highRecent2s = this.mean(t, 0, RECENT_MS, 'high')
    if (totalRecent === null || lowRecent === null || highRecent2s === null) return
    const totalDb = toDb(totalRecent) - toDb(this.reference.total)
    const lowDb = toDb(lowRecent) - toDb(this.reference.low)
    const highDb = toDb(highRecent2s) - toDb(this.reference.high)

    if (this.section === 'intro') {
      this.updateIntro(t, totalDb, totalRecent)
      return
    }
    if (songAge < MIN_HISTORY_MS) {
      this.checkOpenedWithIntro(t, songAge)
      return
    }

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

    // An outro: everything fades together. It ends when the level comes back: soon after it began that was a long break, later it is the next song.
    if (this.section === 'outro') {
      this.outroFloor = Math.min(this.outroFloor, totalRecent)
      const longEnough = t - this.sectionStart >= OUTRO_FALSE_ALARM_MS
      if (totalDb > OUTRO_LEAVE_DB) {
        if (longEnough) this.startNextSong(t)
        else this.enter('groove', t)
      } else if (longEnough && totalRecent > this.outroFloor * OUTRO_NEXT_SONG_RISE_RATIO) {
        this.startNextSong(t)
      }
      return
    }
    if (this.section !== 'drop') {
      this.outroSlots = totalDb < OUTRO_TOTAL_DB && highDb < OUTRO_HIGH_DB ? this.outroSlots + 1 : 0
      if (this.outroSlots >= OUTRO_ENTER_SLOTS) {
        this.enter('outro', t)
        return
      }
    }

    // A different tempo from a few seconds ago is a different song, even with no outro to mark it.
    if (songAge >= TEMPO_MIN_SONG_MS && this.tempoChanged(t)) {
      this.startNextSong(t)
      return
    }

    // A drop: the low end comes back hard right after a buildup or break.
    const lowFine = this.mean(t, 0, FINE_MS, 'low')
    const lowBefore = this.mean(t, BEFORE_FROM_MS, BEFORE_TO_MS, 'low')
    if (this.section !== 'drop' && this.setsUpDrop(t) && lowFine !== null && lowBefore !== null) {
      const jump = toDb(lowFine) - toDb(lowBefore)
      const backToLoud = toDb(lowFine) - toDb(this.reference.low) >= DROP_MIN_LOW_OF_REF_DB
      if (jump >= DROP_LOW_JUMP_DB && backToLoud) {
        this.enter('drop', t)
        return
      }
    }
    if (this.section === 'drop') {
      if (t - this.sectionStart >= DROP_HOLD_MS) this.enter('groove', t)
      return
    }

    // Rising: beats getting denser, or the highs climbing, while the whole is not falling away.
    const rateRecent = this.rate(t, 0, RATE_RECENT_MS)
    const ratePrior = this.rate(t, RATE_RECENT_MS, RATE_PRIOR_TO_MS)
    const highRecent = this.mean(t, 0, RATE_RECENT_MS, 'high')
    const highPrior = this.mean(t, RATE_RECENT_MS, RATE_PRIOR_TO_MS, 'high')
    const denser = rateRecent !== null && ratePrior !== null && rateRecent > ratePrior * RISE_RATE_RATIO && rateRecent - ratePrior >= RISE_RATE_MIN_DELTA
    const brighter = highRecent !== null && highPrior !== null && toDb(highRecent) - toDb(highPrior) >= RISE_HIGH_DB
    const totalPrior = this.mean(t, RATE_RECENT_MS, RATE_PRIOR_TO_MS, 'total')
    const priorAudible = totalPrior !== null && toDb(totalPrior) - toDb(this.reference.total) >= BUILDUP_PRIOR_ABOVE_REF_DB
    // The windows it compares must not reach back into a quiet stretch, or the song coming back up looks like a rise.
    const clearOfQuiet = t - this.lastQuietEnd > RATE_PRIOR_TO_MS
    const rising = (denser || brighter) && totalDb >= BUILDUP_HOLDS_ABOVE_REF_DB && priorAudible && clearOfQuiet

    if (this.section === 'buildup') {
      const sinceStart = t - this.sectionStart
      // It carries on while the beat rate or highs stay above where the build started, and ends when they have been gone for a while.
      const holding =
        (rateRecent !== null && rateRecent >= this.buildupStartRate * 1.2) || (highRecent !== null && highRecent >= this.buildupStartHigh * 1.2)
      if (rising || holding) this.buildupLostAt = null
      else this.buildupLostAt ??= t
      if ((this.buildupLostAt !== null && t - this.buildupLostAt >= BUILDUP_LOST_MS) || sinceStart > BUILDUP_MAX_MS) this.enter('groove', t)
      else if (lowDb < BREAK_LOW_DB && totalDb < BREAK_TOTAL_DB && !rising) this.enter('break', t)
      return
    }

    // A break takes a second of low end gone to start and a couple of seconds to end, so a dip in a groove does not flicker it.
    if (this.section === 'break') {
      const stillBroken = lowDb < BREAK_LEAVE_LOW_DB && totalDb < BREAK_LEAVE_TOTAL_DB
      if (!stillBroken && t - this.sectionStart >= BREAK_MIN_MS) this.enter('groove', t)
      if (!rising) return
    }

    this.risingSlots = rising ? this.risingSlots + 1 : 0
    if (this.risingSlots >= BUILDUP_ENTER_SLOTS) {
      this.buildupStartRate = ratePrior ?? 0
      this.buildupStartHigh = highPrior ?? 0
      this.enter('buildup', t)
      return
    }

    if (this.section === 'groove') {
      this.breakSlots = lowDb < BREAK_LOW_DB && totalDb < BREAK_TOTAL_DB ? this.breakSlots + 1 : 0
      if (this.breakSlots >= BREAK_ENTER_SLOTS) this.enter('break', t)
    }
  }
}

export const sectionTracker = new SectionTracker()
