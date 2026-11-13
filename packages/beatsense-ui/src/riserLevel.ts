// The riser meter's bars (Frequency HUD), from the riser score (the higher of riser.ts and sweep.ts, 0 to 1). The raw score wobbles on
// most music, so nothing shows until it holds over ON_SCORE for SHOW_AFTER_MS. Once on, the bars only climb, one at a time, toward the
// level of the highest score so far, and the meter goes off at once when the riser is over: the score under OFF_SCORE, or well under
// its peak (a riser cut dead, or the drop landing), for OFF_AFTER_MS.

// The numbers are measured (scripts/section-eval/DRUM-HITS.md): synthetic risers alone and 1 to 4 s after a louder sample, held-out Raveform
// tracks and SSME by section. With them 99.8% of risers alone show, 99.5% within a bar (median 0.69 s), and 1.9% of Raveform time outside
// buildups is on the meter (7.4% on SSME, mostly the sweep). False shows are short (median 1.2 s) and peak near 0.67, so most stay at one or
// two bars; real risers peak near 0.98. ON 0.50 with bar 2 at 0.62 trades 0.05 s of delay for about a tenth less false time.

// The score each bar lights at, from the first to the last; the first is also the score that starts the meter.
const BAR_SCORES = [0.45, 0.6, 0.75, 0.88, 0.96] as const
export const RISER_LEVELS = BAR_SCORES.length
export const ON_SCORE = BAR_SCORES[0]
// Under this the meter stops.
export const OFF_SCORE = 0.35
const SHOW_AFTER_MS = 250
// Bars are added one at a time, this far apart, so a riser read late still climbs instead of starting at three.
const STEP_UP_MS = 120
// This far under the peak is the riser ending, even while the score is still above OFF_SCORE (with 0.4, about one riser in five blinks
// off once partway through; a tighter margin blinks more).
const FALL_FROM_PEAK = 0.4
const OFF_AFTER_MS = 120

/** The bars a score is worth: 0 under ON_SCORE, then 1 to RISER_LEVELS. */
export const levelForScore = (score: number): number => BAR_SCORES.filter((barScore) => score >= barScore).length

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
