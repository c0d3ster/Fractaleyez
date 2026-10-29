import {
  AUTO_CLIMB_AFTER_MS,
  AUTO_COST_CHANGE_RATIO,
  AUTO_EVAL_MS,
  AUTO_GRACE_MS,
  AUTO_PROBE_WATCH_MS,
  AUTO_RETRY_BASE_MS,
  AUTO_RETRY_MAX_MS,
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

/**
 * Why Auto last moved between tiers, and when (`at` is the same clock as the `now` passed to `evaluate`). The reason is short enough
 * for one line of the Performance panel: "slow 22 / 41 ms" (median / 95th percentile) or "10 s clean".
 */
export type AutoChange = { from: QualityTier; to: QualityTier; reason: string; at: number }

/** What decides Auto's next move, for the Performance panel. */
export type AutoDiagnostics = {
  /** Median and 95th percentile of the last window of display frame times (ms); null before the first window. */
  frameMs: number | null
  p95Ms: number | null
  /** A window counts as slow when its median is above `slowAboveMs`, or its 95th percentile is above `roughAboveMs`. */
  slowAboveMs: number
  roughAboveMs: number
  /** How long frames have been slow without a break, against how long it takes to step down. */
  slowForMs: number
  slowLimitMs: number
  /** Share of video frames being dropped (smoothed), against the share at which Auto will not step up. */
  videoDropShare: number
  videoDropLimit: number
  /** How long frames have been clean, against how long before Auto tries the next tier up (null: never on frames alone). */
  cleanForMs: number
  climbAfterMs: number | null
  /** Time left on a step up that is on trial (0 when none). */
  probationLeftMs: number
  /** Time left before Auto may step up again after stepping down (0 when it may). */
  retryInMs: number
  /** The last move, with how long ago it was (not a timestamp, since the panel can run in a window with its own clock). */
  lastChange: (Omit<AutoChange, 'at'> & { agoMs: number }) | null
}

export type GovernorOptions = {
  /** How long frames must stay clean before Auto tries the next tier up; null never climbs on frames alone. */
  climbAfterMs?: number | null
}

/**
 * Decides which tier Auto should draw at from the frame times it is fed. Steps down one tier after the frames have been slow for
 * a stretch. Steps up one tier after the frames have been clean for a stretch, but not before a wait since it last stepped down:
 * `AUTO_RETRY_BASE_MS`, doubling (up to `AUTO_RETRY_MAX_MS`) each time a step up turns slow within `AUTO_PROBE_WATCH_MS` and so
 * has to step back down, and back to the base once one holds. That keeps a machine that cannot hold a tier from flip-flopping, and
 * lets one that merely had a bad moment try again soon. Knows nothing about the page: the caller passes in time, frame times and
 * an estimate of the scene's cost (only used to tell that the scene changed, which makes the frames around it unreliable).
 */
export class QualityGovernor {
  private tierIndex: number
  private deltas: number[] = []
  private slowMs = 0
  private graceUntil = 0
  private lastEvalAt: number | null = null
  private lastCost: number | null = null
  // While a step up is on trial: the time it has until it counts as a success (0 when none is).
  private probationUntil = 0
  private refreshMs = REFRESH_SLOWEST_MS
  private cleanMs = 0
  private videoDrop = 0
  // No step up before this time, and how many steps up in a row have had to be undone (each doubles the wait).
  private retryAt = 0
  private failedClimbs = 0
  private lastWindow: { frameMs: number; p95Ms: number } | null = null
  private lastChange: AutoChange | null = null
  private readonly climbAfterMs: number | null

  constructor(start: QualityTier, { climbAfterMs = AUTO_CLIMB_AFTER_MS }: GovernorOptions = {}) {
    const index = AUTO_TIERS.indexOf(start)
    this.tierIndex = index === -1 ? AUTO_TIERS.length - 1 : index
    this.climbAfterMs = climbAfterMs
  }

  getTier = (): QualityTier => AUTO_TIERS[this.tierIndex]!

  getDiagnostics = (now: number): AutoDiagnostics => ({
    frameMs: this.lastWindow?.frameMs ?? null,
    p95Ms: this.lastWindow?.p95Ms ?? null,
    slowAboveMs: this.slowThresholdMs(),
    roughAboveMs: this.refreshMs * AUTO_ROUGH_FACTOR,
    slowForMs: this.slowMs,
    slowLimitMs: AUTO_SLOW_FOR_MS,
    videoDropShare: this.videoDrop,
    videoDropLimit: AUTO_VIDEO_DROP_LIMIT,
    cleanForMs: this.cleanMs,
    climbAfterMs: this.climbAfterMs,
    probationLeftMs: this.probationUntil === 0 ? 0 : Math.max(0, this.probationUntil - now),
    retryInMs: Math.max(0, this.retryAt - now),
    lastChange: this.lastChange ? { from: this.lastChange.from, to: this.lastChange.to, reason: this.lastChange.reason, agoMs: now - this.lastChange.at } : null,
  })

  // A median frame time above this is slow: 1.4 display refreshes, kept between the limits.
  private slowThresholdMs = (): number => clamp(this.refreshMs * AUTO_SLOW_FACTOR, AUTO_SLOW_MIN_MS, AUTO_SLOW_MAX_MS)

  private recordChange = (now: number, from: number, reason: string): void => {
    this.lastChange = { from: AUTO_TIERS[from]!, to: this.getTier(), reason, at: now }
  }

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
    return this.judgeFrames(now, elapsed, capped)
  }

  // A change in what the scene draws makes the frames around it unreliable, so they are ignored for a while.
  private watchCost = (now: number, cost: number): void => {
    const previous = this.lastCost
    this.lastCost = cost
    if (previous === null) return
    if (Math.abs(cost - previous) <= Math.max(previous, Number.EPSILON) * AUTO_COST_CHANGE_RATIO) return
    this.disturb(now)
  }

  private judgeFrames = (now: number, elapsed: number, capped: boolean): QualityTier => {
    const frames = this.deltas
    this.deltas = []
    if (frames.length < MIN_WINDOW_FRAMES) return this.getTier()
    const frameMs = median(frames)
    if (frames.length >= REFRESH_WINDOW_FRAMES) this.refreshMs = clamp(Math.min(this.refreshMs, frameMs), REFRESH_FASTEST_MS, REFRESH_SLOWEST_MS)
    const p95Ms = percentile95(frames)
    this.lastWindow = { frameMs, p95Ms }
    // A tier whose cap is slow is drawn at the cap's own pace, so its frames never count as slow.
    const slow = frameMs > this.slowThresholdMs() || p95Ms > this.refreshMs * AUTO_ROUGH_FACTOR
    this.slowMs = !capped && slow ? this.slowMs + elapsed : 0
    // Dropped video frames stop a climb even when the frame times look fine; they do not step a tier down by themselves.
    const struggling = this.slowMs > 0 || this.videoDrop > AUTO_VIDEO_DROP_LIMIT
    this.cleanMs = struggling ? 0 : this.cleanMs + elapsed
    if (this.slowMs === 0 && this.probationUntil !== 0 && now >= this.probationUntil) this.passProbation()
    if (this.slowMs >= AUTO_SLOW_FOR_MS && this.tierIndex > 0) return this.stepDown(now)
    return this.climbIfClean(now)
  }

  // Stepping down during a step up's trial means that step up failed, which doubles the wait before the next one.
  private stepDown = (now: number): QualityTier => {
    const slowWindow = this.lastWindow
    this.failedClimbs = this.probationUntil !== 0 ? this.failedClimbs + 1 : 0
    this.retryAt = now + Math.min(AUTO_RETRY_BASE_MS * 2 ** this.failedClimbs, AUTO_RETRY_MAX_MS)
    this.tierIndex--
    this.recordChange(now, this.tierIndex + 1, slowWindow ? `slow ${slowWindow.frameMs.toFixed(0)} / ${slowWindow.p95Ms.toFixed(0)} ms` : `slow ${AUTO_SLOW_FOR_MS / 1000} s`)
    this.probationUntil = 0
    this.cleanMs = 0
    this.settle(now)
    return this.getTier()
  }

  // Frames have been clean for a while and the wait since the last step down is over: try the next tier, and watch it for `AUTO_PROBE_WATCH_MS`.
  private climbIfClean = (now: number): QualityTier => {
    if (this.climbAfterMs === null || this.probationUntil !== 0) return this.getTier()
    if (this.tierIndex >= AUTO_TIERS.length - 1 || this.cleanMs < this.climbAfterMs || now < this.retryAt) return this.getTier()
    const cleanSeconds = Math.round(this.cleanMs / 1000)
    this.tierIndex++
    this.recordChange(now, this.tierIndex - 1, `${cleanSeconds} s clean`)
    this.probationUntil = now + AUTO_PROBE_WATCH_MS
    this.cleanMs = 0
    this.settle(now)
    return this.getTier()
  }

  // The step up held, so the wait before the next failure starts from the base again.
  private passProbation = (): void => {
    this.probationUntil = 0
    this.failedClimbs = 0
  }

  private settle = (now: number): void => {
    this.graceUntil = now + AUTO_STEP_SETTLE_MS
    this.slowMs = 0
    this.deltas = []
  }
}
