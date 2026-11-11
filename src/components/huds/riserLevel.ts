// The riser meter's bars (Frequency HUD), from the riser score (the higher of riser.ts and sweep.ts, 0 to 1). The raw score wobbles on
// most music, so nothing shows until it holds over ON_SCORE for SHOW_AFTER_MS. Once on, the bars only climb, one at a time, toward the
// level of the highest score so far, and the meter goes off at once when the riser is over: the score under OFF_SCORE, or well under
// its peak (a riser cut dead, or the drop landing), for OFF_AFTER_MS.

export const RISER_LEVELS = 5
// The score that starts the meter, and the one under which it stops.
export const ON_SCORE = 0.35
export const OFF_SCORE = 0.25
// The score that lights every bar; the ones between are spread evenly from ON_SCORE.
const FULL_SCORE = 0.85
const SCORE_PER_LEVEL = (FULL_SCORE - ON_SCORE) / (RISER_LEVELS - 1)
const SHOW_AFTER_MS = 150
// Bars are added one at a time, this far apart, so a riser read late still climbs instead of starting at three.
const STEP_UP_MS = 120
// This far under the peak is the riser ending, even while the score is still above OFF_SCORE.
const FALL_FROM_PEAK = 0.25
const OFF_AFTER_MS = 120

/** The bars a score is worth: 0 under ON_SCORE, then 1 to RISER_LEVELS. */
export const levelForScore = (score: number): number => {
  if (score < ON_SCORE) return 0
  return Math.min(RISER_LEVELS, 1 + Math.floor((score - ON_SCORE) / SCORE_PER_LEVEL + 1e-9))
}

/** The bars shown, stepped once per HUD draw. */
export class RiserLevel {
  private level = 0
  private peak = 0
  private aboveSince: number | null = null
  private endingSince: number | null = null
  private lastStepAt = 0

  step = (score: number, now: number): number => {
    if (this.level === 0) return this.stepOff(score, now)
    this.peak = Math.max(this.peak, score)
    const ending = score < OFF_SCORE || score < this.peak - FALL_FROM_PEAK
    if (ending) {
      this.endingSince ??= now
      if (now - this.endingSince >= OFF_AFTER_MS) this.reset()
      return this.level
    }
    this.endingSince = null
    if (levelForScore(this.peak) > this.level && now - this.lastStepAt >= STEP_UP_MS) {
      this.level++
      this.lastStepAt = now
    }
    return this.level
  }

  reset = (): void => {
    this.level = 0
    this.peak = 0
    this.aboveSince = null
    this.endingSince = null
  }

  private stepOff = (score: number, now: number): number => {
    if (score < ON_SCORE) {
      this.aboveSince = null
      return 0
    }
    this.aboveSince ??= now
    if (now - this.aboveSince < SHOW_AFTER_MS) return 0
    this.level = 1
    this.peak = score
    this.lastStepAt = now
    this.aboveSince = null
    return this.level
  }
}
