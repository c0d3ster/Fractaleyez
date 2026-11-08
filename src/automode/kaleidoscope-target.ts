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

// The labels are wrong often enough on the small moments that a change has to be wanted for a while, and the last
// one has to have been showing a while. A flicker of the label then never reaches the screen.
const WANT_MS = 1200
const DWELL_MS = 2500

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
  private lastDropCount: number | null = null
  private lastSongIndex: number | null = null

  step = (state: SectionState, nowMs: number): KaleidoscopeFold => {
    const wanted = wantedFold(state)
    // A drop is a moment to land on, so it skips the wait (late is fine: it reads well a few seconds on). A new song starts clean.
    const dropped = this.lastDropCount !== null && state.dropCount > this.lastDropCount && state.section === 'drop'
    const newSong = this.lastSongIndex !== null && state.songIndex !== this.lastSongIndex
    this.lastDropCount = state.dropCount
    this.lastSongIndex = state.songIndex

    if (newSong) return this.apply(OFF, nowMs)
    if (same(wanted, this.current)) {
      this.pending = null
      return this.current
    }
    if (dropped) return this.apply(wanted, nowMs)
    if (this.pending === null || !same(this.pending, wanted)) {
      this.pending = wanted
      this.pendingSince = nowMs
      return this.current
    }
    if (nowMs - this.pendingSince >= WANT_MS && nowMs - this.changedAt >= DWELL_MS) return this.apply(wanted, nowMs)
    return this.current
  }

  reset = (): void => {
    this.current = OFF
    this.changedAt = Number.NEGATIVE_INFINITY
    this.pending = null
    this.lastDropCount = null
    this.lastSongIndex = null
  }

  private apply = (fold: KaleidoscopeFold, nowMs: number): KaleidoscopeFold => {
    this.current = fold
    this.changedAt = nowMs
    this.pending = null
    return fold
  }
}
