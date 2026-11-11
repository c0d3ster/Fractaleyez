// The riser meter's bars (Frequency HUD), from the riser score (the higher of riser.ts and sweep.ts, 0 to 1). The raw score wobbles
// between 0.1 and 0.4 on most music, so nothing shows until it is clearly a riser (ON_SCORE, held for SHOW_AFTER_MS), it stays up
// until the score falls well under that (OFF_SCORE), and each bar has to hold for a moment before it is added or taken away.

export const RISER_LEVELS = 5
// The score that starts the meter, and the one that stops it once it is on.
export const ON_SCORE = 0.5
export const OFF_SCORE = 0.4
// Each bar above the first takes this much more score.
const SCORE_PER_LEVEL = (0.95 - ON_SCORE) / (RISER_LEVELS - 1)
// A level change only moves the meter when it has held this long, so one slot's spike or dip does not.
const SHOW_AFTER_MS = 500
const RISE_AFTER_MS = 250
const FALL_AFTER_MS = 400
// A bar is not taken away until the score is this far under it.
const FALL_MARGIN = 0.04

/** The bars a score is worth, ignoring time: 0 under ON_SCORE, then 1 to RISER_LEVELS. */
export const levelForScore = (score: number): number => {
  if (score < ON_SCORE) return 0
  return Math.min(RISER_LEVELS, 1 + Math.floor((score - ON_SCORE) / SCORE_PER_LEVEL + 1e-9))
}

/** The bars shown, stepped once per HUD draw. */
export class RiserLevel {
  private level = 0
  private pendingLevel = 0
  private pendingSince: number | null = null

  step = (score: number, now: number): number => {
    const target = this.targetFor(score)
    if (target === this.level) {
      this.pendingSince = null
      return this.level
    }
    if (this.pendingSince === null || target !== this.pendingLevel) {
      this.pendingLevel = target
      this.pendingSince = now
    }
    const holdMs = target > this.level ? (this.level === 0 ? SHOW_AFTER_MS : RISE_AFTER_MS) : FALL_AFTER_MS
    if (now - this.pendingSince < holdMs) return this.level
    // One bar at a time on the way down, so a drop from five reads as the riser ending, not a blink.
    this.level = target > this.level ? target : this.level - 1
    this.pendingSince = this.level === target ? null : now
    return this.level
  }

  reset = (): void => {
    this.level = 0
    this.pendingLevel = 0
    this.pendingSince = null
  }

  private targetFor = (score: number): number => {
    if (this.level > 0 && score < OFF_SCORE) return 0
    if (this.level > 0 && score < ON_SCORE) return 1
    const raw = levelForScore(score)
    // Hold the current bar unless the score has clearly left it.
    if (raw < this.level && levelForScore(score + FALL_MARGIN) >= this.level) return this.level
    return raw
  }
}
