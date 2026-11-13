// The lab's performance readout: what the page, the HUDs' drawing and the analysis cost over the last second.

const WINDOW_MS = 1000

/** Values seen in the last second, with their time (page clock): the count, the mean, the largest and the total. */
export class RollingStats {
  private readonly times: number[] = []
  private readonly values: number[] = []

  add = (value: number, nowMs: number): void => {
    this.times.push(nowMs)
    this.values.push(value)
    this.trim(nowMs)
  }

  read = (nowMs: number): { count: number; mean: number; max: number; total: number } => {
    this.trim(nowMs)
    const count = this.values.length
    const total = this.values.reduce((sum, value) => sum + value, 0)
    return { count, mean: count > 0 ? total / count : 0, max: count > 0 ? Math.max(...this.values) : 0, total }
  }

  private trim = (nowMs: number): void => {
    while (this.times.length > 0 && nowMs - (this.times[0] ?? nowMs) > WINDOW_MS) {
      this.times.shift()
      this.values.shift()
    }
  }
}

/** What the status line shows, over the last second. */
export type PerfReading = {
  /** Frames the page drew, and the longest gap between two (a stall in the GPU or compositor shows here, not in the scripts). */
  pageFps: number
  worstFrameMs: number
  /** Average script time of one HUD redraw (its draw calls; the browser's own drawing of them is in the frame gaps). */
  drawMs: number
  /** Average time to analyse one audio frame, and the share of one CPU core the analysis took. */
  analysisMs: number
  analysisShare: number
}
