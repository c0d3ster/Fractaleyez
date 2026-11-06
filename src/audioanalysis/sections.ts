// Labels the current part of a song (quiet, groove, buildup, break, drop) from slow features of the band levels.
// Everything is judged against the song's own recent loudness, never absolute levels, so a quiet mic and a loud
// feed behave the same. The clock comes in with each sample, so the tracker is pure and testable.

export type SongSection = 'quiet' | 'groove' | 'buildup' | 'break' | 'drop'

export type SectionState = {
  section: SongSection
  /** How loud the song is right now against its own recent peak, 0 to 1. */
  intensity: number
  /** How far into a typical buildup we are, 0 to 1. Zero outside a buildup. */
  buildupProgress: number
  /** How long the current section has lasted. */
  sinceMs: number
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
// Needs this much song before it says anything but groove: the first stretch is mostly an intro ramping up from silence, which is not a buildup.
const MIN_HISTORY_MS = 20000
const RECENT_MS = 2000
// Long enough to hold a few kicks, so a single hit against a quieter average does not read as the low end coming back.
const FINE_MS = 1000
const BEFORE_FROM_MS = 1500
const BEFORE_TO_MS = 5000
const RATE_RECENT_MS = 3000
const RATE_PRIOR_TO_MS = 9000

const QUIET_ENTER_DB = -14
const QUIET_LEAVE_DB = -8
const QUIET_ENTER_SLOTS = 4
const QUIET_MIN_MS = 3000
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

const FLOOR = 1e-3
const toDb = (value: number): number => 20 * Math.log10(Math.max(value, FLOOR))
const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))

const SETUP_MIN_MS: Record<'buildup' | 'break' | 'quiet', number> = {
  buildup: DROP_AFTER_BUILDUP_MIN_MS,
  break: DROP_AFTER_BREAK_MIN_MS,
  quiet: DROP_AFTER_QUIET_MIN_MS,
}

type Pick = 'total' | 'low' | 'high'

export class SectionTracker {
  private readonly slots: SectionSlot[] = []
  private slotStart: number | null = null
  private firstSlotAt: number | null = null
  private sums = { total: 0, low: 0, high: 0 }
  private frames = 0
  private beats = 0
  private reference = { total: 0, low: 0 }
  private section: SongSection = 'groove'
  private sectionStart = 0
  private lastSetupEnd = -Infinity
  private lastQuietEnd = -Infinity
  private lastSetupLongEnough = false
  private risingSlots = 0
  private breakSlots = 0
  private quietSlots = 0
  private buildupStartRate = 0
  private buildupStartHigh = 0
  private buildupLostAt: number | null = null
  private state: SectionState = { section: 'groove', intensity: 0, buildupProgress: 0, sinceMs: 0 }

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
    if (beat) this.beats++

    if (t - this.slotStart < SLOT_MS) return
    this.closeSlot(t)
  }

  getState = (): SectionState => this.state

  /** The closed slots, oldest first. Not a copy: read it where it is called. */
  getHistory = (): readonly SectionSlot[] => this.slots

  reset = (): void => {
    this.slots.length = 0
    this.slotStart = null
    this.firstSlotAt = null
    this.sums = { total: 0, low: 0, high: 0 }
    this.frames = 0
    this.beats = 0
    this.reference = { total: 0, low: 0 }
    this.section = 'groove'
    this.sectionStart = 0
    this.risingSlots = 0
    this.breakSlots = 0
    this.quietSlots = 0
    this.buildupLostAt = null
    this.lastSetupEnd = -Infinity
    this.lastQuietEnd = -Infinity
    this.lastSetupLongEnough = false
    this.state = { section: 'groove', intensity: 0, buildupProgress: 0, sinceMs: 0 }
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
      this.firstSlotAt = t
      this.reference = { total: 0, low: 0 }
      this.section = 'groove'
      this.sectionStart = t
      slot.section = 'groove'
    }
    this.slots.push(slot)
    const oldest = this.slots.findIndex((s) => t - s.t <= HISTORY_MS)
    if (oldest > 0) this.slots.splice(0, oldest)
    this.updateReference(slot)

    this.evaluate(t)
    slot.section = this.section
    this.state = {
      section: this.section,
      intensity: this.intensity(t),
      buildupProgress: this.section === 'buildup' ? clamp01((t - this.sectionStart) / BUILDUP_TYPICAL_MS) : 0,
      sinceMs: t - this.sectionStart,
    }
  }

  private updateReference = (slot: SectionSlot): void => {
    const release = 1 - Math.exp(-SLOT_MS / REFERENCE_RELEASE_TAU_MS)
    const follow = (reference: number, value: number): number => (value >= reference ? value : reference + (value - reference) * release)
    this.reference = { total: follow(this.reference.total, slot.total), low: follow(this.reference.low, slot.low) }
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
    if (this.section === 'buildup' || this.section === 'break' || this.section === 'quiet') {
      this.lastSetupEnd = t
      this.lastSetupLongEnough = t - this.sectionStart >= SETUP_MIN_MS[this.section]
    }
    this.section = section
    this.sectionStart = t
    this.risingSlots = 0
    this.breakSlots = 0
    this.quietSlots = 0
    this.buildupLostAt = null
  }

  // True when a buildup, break or quiet stretch is on, or just ended, and ran long enough to be the setup for a drop.
  private setsUpDrop = (t: number): boolean => {
    if (this.section === 'buildup' || this.section === 'break' || this.section === 'quiet') return t - this.sectionStart >= SETUP_MIN_MS[this.section]
    return this.lastSetupLongEnough && t - this.lastSetupEnd <= DROP_LOOKBACK_MS
  }

  private evaluate = (t: number): void => {
    if (this.firstSlotAt === null || t - this.firstSlotAt < MIN_HISTORY_MS) return

    const totalRecent = this.mean(t, 0, RECENT_MS, 'total')
    const lowRecent = this.mean(t, 0, RECENT_MS, 'low')
    if (totalRecent === null || lowRecent === null) return
    const totalDb = toDb(totalRecent) - toDb(this.reference.total)
    const lowDb = toDb(lowRecent) - toDb(this.reference.low)

    // Quiet, with hysteresis: it takes a smaller dip to stay quiet than to become it.
    if (this.section === 'quiet') {
      if (totalDb > QUIET_LEAVE_DB && t - this.sectionStart >= QUIET_MIN_MS) this.enter('groove', t)
      return
    }
    // It takes a second below the line to go quiet, so one dip between hits does not.
    this.quietSlots = totalDb < QUIET_ENTER_DB ? this.quietSlots + 1 : 0
    if (this.quietSlots >= QUIET_ENTER_SLOTS) {
      this.enter('quiet', t)
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
