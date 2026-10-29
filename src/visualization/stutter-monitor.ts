import { AUTO_BUSY_SETTLE_MS } from '../config/quality.config'
import { loadTracker } from './load-tracker'

/** A gap between frames longer than this is a stutter you can see. */
export const STUTTER_MS = 50
/** The Performance panel counts stutters over this long. */
export const STUTTER_WINDOW_MS = 60000

export type StutterSummary = { count: number; worstMs: number }

/**
 * Remembers recent frame gaps over `STUTTER_MS`, so the Performance panel can say how many happened lately and how bad the worst was.
 * `record` runs on every frame, so a frame that did not stutter costs one comparison and allocates nothing.
 * `skip` says when a gap should not count, such as while the page is still loading.
 */
export class StutterMonitor {
  private events: Array<{ at: number; ms: number }> = []

  constructor(private readonly skip: (now: number) => boolean = () => false) {}

  /** Call with every frame gap; gaps under the threshold are ignored. */
  record = (now: number, gapMs: number): void => {
    if (gapMs <= STUTTER_MS || this.skip(now)) return
    this.events = this.events.filter(({ at }) => now - at <= STUTTER_WINDOW_MS)
    this.events.push({ at: now, ms: gapMs })
  }

  summary = (now: number): StutterSummary => {
    let count = 0
    let worstMs = 0
    this.events.forEach(({ at, ms }) => {
      if (now - at > STUTTER_WINDOW_MS) return
      count++
      worstMs = Math.max(worstMs, ms)
    })
    return { count, worstMs }
  }
}

// Shader compiles, decodes and first uploads make long frames while the page loads. They say nothing about how it runs, so they do not count (Auto ignores them too).
const whileLoading = (now: number): boolean => loadTracker.isLoadingOrSettling(now, AUTO_BUSY_SETTLE_MS)

/** Gaps between display frames (the whole page), and between frames of the playing video. */
export const displayStutters = new StutterMonitor(whileLoading)
export const videoStutters = new StutterMonitor(whileLoading)
