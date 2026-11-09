import type { SectionState } from '../audioanalysis/sections'

/** What Auto wants the kaleidoscope to do: `on` false is no fold; `count` is the number of wedges (even). */
export type KaleidoscopeFold = { on: boolean, count: number }

const OFF: KaleidoscopeFold = { on: false, count: 2 }

// Wedges while a buildup climbs: more mirrors as the tension rises.
const BUILDUP_COUNTS = [2, 4, 6, 8] as const
// The drop lands big, then settles to a calmer fold for the rest of the drop.
const DROP_PEAK_COUNT = 16
const DROP_SETTLED_COUNT = 8
const DROP_PEAK_MS = 6000

// The labels are wrong often enough on the small moments that a change could be made to wait: wanted for `wantMs` before it is
// decided, and the last one shown for `dwellMs` before another. A decided change then goes out on the next beat, or after
// `beatWaitMs` if none comes, so it lands on the music. None of these numbers are measured. The hold is off for now (try it
// instant first; the section model already waits about half a second before it says "buildup"); 1200 was the first guess.
export type KaleidoscopeTuning = { wantMs: number, dwellMs: number, beatWaitMs: number }

export const DEFAULT_TUNING: KaleidoscopeTuning = { wantMs: 0, dwellMs: 2500, beatWaitMs: 600 }

const same = (a: KaleidoscopeFold, b: KaleidoscopeFold): boolean => a.on === b.on && a.count === b.count

/** What the section alone asks for, before any smoothing. */
export const wantedFold = (state: SectionState): KaleidoscopeFold => {
  if (state.songMs === null) return OFF
  if (state.section === 'buildup') {
    const index = Math.min(BUILDUP_COUNTS.length - 1, Math.floor(state.buildupProgress * BUILDUP_COUNTS.length))
    return { on: true, count: BUILDUP_COUNTS[index] ?? 2 }
  }
  if (state.section === 'turnaround') return { on: true, count: BUILDUP_COUNTS[BUILDUP_COUNTS.length - 1] ?? 8 }
  if (state.section === 'drop') {
    const early = state.sinceDropMs !== null && state.sinceDropMs < DROP_PEAK_MS
    return { on: true, count: early ? DROP_PEAK_COUNT : DROP_SETTLED_COUNT }
  }
  return OFF
}

/** Follows the song section with the kaleidoscope, a step at a time. Holds the smoothing state; the clock is passed in. */
export class KaleidoscopeAuto {
  private current: KaleidoscopeFold = OFF
  private changedAt = Number.NEGATIVE_INFINITY
  private pending: KaleidoscopeFold | null = null
  private pendingSince = 0
  /** A change has been decided and is waiting for a beat; this is when it was decided. */
  private decidedAt: number | null = null
  private lastDropCount: number | null = null
  private lastSongIndex: number | null = null

  constructor(private readonly tuning: KaleidoscopeTuning = DEFAULT_TUNING) {}

  /** `beat` is true on the frame a beat is detected: a decided change is shown on one, not between them. */
  step = (state: SectionState, nowMs: number, beat: boolean): KaleidoscopeFold => {
    const wanted = wantedFold(state)
    // A drop is a moment to land on, so it skips the wait (late is fine: it reads well a few seconds on). A new song starts clean.
    const dropped = this.lastDropCount !== null && state.dropCount > this.lastDropCount && state.section === 'drop'
    const newSong = this.lastSongIndex !== null && state.songIndex !== this.lastSongIndex
    this.lastDropCount = state.dropCount
    this.lastSongIndex = state.songIndex

    if (newSong) return this.apply(OFF, nowMs)
    if (same(wanted, this.current)) {
      this.pending = null
      this.decidedAt = null
      return this.current
    }
    if (dropped) this.decide(nowMs)
    else if (this.decidedAt === null) this.considerChange(wanted, nowMs)
    // Decided: it goes out on the next beat. The wish may have moved on while it waited, so it is the latest wish that shows.
    if (this.decidedAt !== null && (beat || nowMs - this.decidedAt >= this.tuning.beatWaitMs)) return this.apply(wanted, nowMs)
    return this.current
  }

  reset = (): void => {
    this.current = OFF
    this.changedAt = Number.NEGATIVE_INFINITY
    this.pending = null
    this.decidedAt = null
    this.lastDropCount = null
    this.lastSongIndex = null
  }

  /** A wish has to be held for a while, and the last change shown for a while, before it is decided. */
  private considerChange = (wanted: KaleidoscopeFold, nowMs: number): void => {
    if (this.pending === null || !same(this.pending, wanted)) {
      this.pending = wanted
      this.pendingSince = nowMs
      return
    }
    if (nowMs - this.pendingSince >= this.tuning.wantMs && nowMs - this.changedAt >= this.tuning.dwellMs) this.decide(nowMs)
  }

  private decide = (nowMs: number): void => {
    this.decidedAt = nowMs
    this.pending = null
  }

  private apply = (fold: KaleidoscopeFold, nowMs: number): KaleidoscopeFold => {
    this.current = fold
    this.changedAt = nowMs
    this.pending = null
    this.decidedAt = null
    return fold
  }
}
