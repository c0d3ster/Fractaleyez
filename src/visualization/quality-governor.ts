import {
  AUTO_CLIMB_AFTER_MS,
  AUTO_COST_CHANGE_RATIO,
  AUTO_EVAL_MS,
  AUTO_GRACE_MS,
  AUTO_PROBE_COST_RATIO,
  AUTO_PROBE_WATCH_MS,
  AUTO_ROUGH_FACTOR,
  AUTO_SLOW_FACTOR,
  AUTO_SLOW_FOR_MS,
  AUTO_SLOW_MAX_MS,
  AUTO_SLOW_MIN_MS,
  AUTO_STEP_SETTLE_MS,
  AUTO_TIERS,
  AUTO_VIDEO_DROP_LIMIT,
  QualityTier,
} from '../config/quality.config'

// Display refresh is estimated from the fastest full window seen, never slower than 60Hz (browsers do not run slower displays) or faster than this.
const REFRESH_SLOWEST_MS = 1000 / 60
const REFRESH_FASTEST_MS = 1000 / 240
// A scene so heavy that only a few frames fit in a window is the one Auto most needs to judge, so any frame counts.
const MIN_WINDOW_FRAMES = 1
// A window this full is trusted to show the display's own refresh rate when it is running well.
const REFRESH_WINDOW_FRAMES = 30

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] ?? 0
}

const percentile95 = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0
}

const clamp = (value: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, value))

// Each window's share of dropped video frames is blended into a running figure, so one dropped frame in a short window does not count as trouble.
const VIDEO_DROP_SMOOTHING = 0.2

/** A tier Auto stepped down from, and the scene cost it did so at: off limits until the scene gets cheaper. */
export type AutoCeiling = { tier: QualityTier; cost: number }

export type GovernorOptions = {
  /** How long frames must stay clean before Auto tries the next tier up; null never climbs on frames alone (probes for a cheaper scene still happen). */
  climbAfterMs?: number | null
  /** A tier that failed on an earlier visit, so Auto does not retry it every load. */
  ceiling?: AutoCeiling | null
}

/**
 * Decides which tier Auto should draw at from the frame times it is fed. Steps down one tier after the frames have been
 * slow for a stretch. Steps up one tier (a probe) when the scene gets clearly cheaper than the scene it last stepped
 * down on; a probe that turns slow steps back down, and then waits for another cheaper scene, so it cannot flip-flop.
 * Knows nothing about the page: the caller passes in time, frame times and a cost estimate of the scene.
 */
export class QualityGovernor {
  private tierIndex: number
  private deltas: number[] = []
  private slowMs = 0
  private graceUntil = 0
  private lastEvalAt: number | null = null
  private lastCost: number | null = null
  private costAtDrop: number | null = null
  private probePending = false
  // While a probe is on trial: the time it has until it counts as a success (0 when none is).
  private probationUntil = 0
  private refreshMs = REFRESH_SLOWEST_MS
  private cleanMs = 0
  private videoDrop = 0
  private ceilingIndex = AUTO_TIERS.length - 1
  private ceilingCost: number | null = null
  private readonly climbAfterMs: number | null

  constructor(start: QualityTier, { climbAfterMs = AUTO_CLIMB_AFTER_MS, ceiling = null }: GovernorOptions = {}) {
    const index = AUTO_TIERS.indexOf(start)
    this.tierIndex = index === -1 ? AUTO_TIERS.length - 1 : index
    this.climbAfterMs = climbAfterMs
    if (ceiling) this.setCeiling(ceiling.tier, ceiling.cost)
    this.tierIndex = Math.min(this.tierIndex, this.ceilingIndex)
  }

  /** The tier above the highest one allowed, with the cost it was ruled out at, or null when nothing is ruled out. */
  getCeiling = (): AutoCeiling | null => (this.ceilingCost === null ? null : { tier: AUTO_TIERS[this.ceilingIndex]!, cost: this.ceilingCost })

  getTier = (): QualityTier => AUTO_TIERS[this.tierIndex]!

  /** One frame's time in ms (the gap between display frames, not just the drawn ones). */
  push = (frameMs: number): void => {
    this.deltas.push(frameMs)
  }

  /** The frames so far do not describe the scene any more (a resize, a tab refocus, a manual change). */
  disturb = (now: number): void => {
    this.graceUntil = now + AUTO_GRACE_MS
    this.slowMs = 0
    this.cleanMs = 0
    this.deltas = []
  }

  /**
   * Call every `AUTO_EVAL_MS` or so with the current time and the scene's estimated cost. Returns the tier to draw at.
   * `capped` says the tier being drawn is frame-capped, so its frame times are the cap's and say nothing about load.
   * `videoDropRate` is the share of video frames dropped since the last call (0 with no video).
   */
  evaluate = (now: number, cost: number, capped: boolean, videoDropRate = 0): QualityTier => {
    this.videoDrop += (videoDropRate - this.videoDrop) * VIDEO_DROP_SMOOTHING
    const elapsed = this.lastEvalAt === null ? AUTO_EVAL_MS : now - this.lastEvalAt
    this.lastEvalAt = now
    this.watchCost(now, cost)
    if (now < this.graceUntil) {
      this.deltas = []
      return this.getTier()
    }
    if (this.probePending && this.tierIndex < AUTO_TIERS.length - 1) {
      this.probePending = false
      this.tierIndex++
      this.probationUntil = now + AUTO_PROBE_WATCH_MS
      this.settle(now)
      return this.getTier()
    }
    this.probePending = false
    return this.judgeFrames(now, elapsed, cost, capped)
  }

  private watchCost = (now: number, cost: number): void => {
    const previous = this.lastCost
    this.lastCost = cost
    if (previous === null) return
    if (Math.abs(cost - previous) <= Math.max(previous, Number.EPSILON) * AUTO_COST_CHANGE_RATIO) return
    this.disturb(now)
    const cheaperThanDrop = this.costAtDrop !== null && cost <= this.costAtDrop * AUTO_PROBE_COST_RATIO
    this.probePending = cost < previous && cheaperThanDrop
    // A clearly cheaper scene lifts the ceiling: the tier that was too heavy may hold now.
    if (this.ceilingCost !== null && cost <= this.ceilingCost * AUTO_PROBE_COST_RATIO) this.clearCeiling()
  }

  private judgeFrames = (now: number, elapsed: number, cost: number, capped: boolean): QualityTier => {
    const frames = this.deltas
    this.deltas = []
    if (frames.length < MIN_WINDOW_FRAMES) return this.getTier()
    const frameMs = median(frames)
    if (frames.length >= REFRESH_WINDOW_FRAMES) this.refreshMs = clamp(Math.min(this.refreshMs, frameMs), REFRESH_FASTEST_MS, REFRESH_SLOWEST_MS)
    const slowAtMs = clamp(this.refreshMs * AUTO_SLOW_FACTOR, AUTO_SLOW_MIN_MS, AUTO_SLOW_MAX_MS)
    // A tier whose cap is slow is drawn at the cap's own pace, so its frames never count as slow.
    const slow = frameMs > slowAtMs || percentile95(frames) > this.refreshMs * AUTO_ROUGH_FACTOR
    this.slowMs = !capped && slow ? this.slowMs + elapsed : 0
    // Dropped video frames stop a climb even when the frame times look fine; they do not step a tier down by themselves.
    const struggling = this.slowMs > 0 || this.videoDrop > AUTO_VIDEO_DROP_LIMIT
    this.cleanMs = struggling ? 0 : this.cleanMs + elapsed
    if (this.slowMs === 0 && this.probationUntil !== 0 && now >= this.probationUntil) this.passProbation(cost)
    if (this.slowMs >= AUTO_SLOW_FOR_MS && this.tierIndex > 0) return this.stepDown(now, cost)
    return this.climbIfClean(now)
  }

  // The tier above the one it lands on was too heavy at this cost, so it stays off limits until the scene gets cheaper.
  private stepDown = (now: number, cost: number): QualityTier => {
    this.tierIndex--
    this.probationUntil = 0
    this.costAtDrop = cost
    this.cleanMs = 0
    this.setCeiling(this.getTier(), cost)
    this.settle(now)
    return this.getTier()
  }

  // Frames have been clean for a while and the tier above is not ruled out: try it, and watch it for `AUTO_PROBE_WATCH_MS`.
  private climbIfClean = (now: number): QualityTier => {
    if (this.climbAfterMs === null || this.probationUntil !== 0) return this.getTier()
    if (this.tierIndex >= this.ceilingIndex || this.cleanMs < this.climbAfterMs) return this.getTier()
    this.tierIndex++
    this.probationUntil = now + AUTO_PROBE_WATCH_MS
    this.cleanMs = 0
    this.settle(now)
    return this.getTier()
  }

  private setCeiling = (tier: QualityTier, cost: number): void => {
    const index = AUTO_TIERS.indexOf(tier)
    if (index === -1) return
    this.ceilingIndex = index
    this.ceilingCost = cost
  }

  private clearCeiling = (): void => {
    this.ceilingIndex = AUTO_TIERS.length - 1
    this.ceilingCost = null
  }

  // The probe held, so if the scene is still cheaper than where Auto last dropped it may go one tier higher again.
  private passProbation = (cost: number): void => {
    this.probationUntil = 0
    this.probePending = this.costAtDrop !== null && cost <= this.costAtDrop * AUTO_PROBE_COST_RATIO
  }

  private settle = (now: number): void => {
    this.graceUntil = now + AUTO_STEP_SETTLE_MS
    this.slowMs = 0
    this.deltas = []
  }
}
