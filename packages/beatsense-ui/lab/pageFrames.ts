import { RollingStats } from './perfStats'

/** Counts the page's frames with its own requestAnimationFrame loop, while started. */
export class PageFrames {
  private readonly gaps = new RollingStats()
  private frame: number | null = null
  private last: number | null = null

  start = (): void => {
    if (this.frame !== null) return
    const loop = (now: number): void => {
      if (this.last !== null) this.gaps.add(now - this.last, now)
      this.last = now
      this.frame = requestAnimationFrame(loop)
    }
    this.frame = requestAnimationFrame(loop)
  }

  stop = (): void => {
    if (this.frame !== null) cancelAnimationFrame(this.frame)
    this.frame = null
    this.last = null
  }

  read = (nowMs: number): { fps: number; worstMs: number } => {
    const { count, max } = this.gaps.read(nowMs)
    return { fps: count, worstMs: max }
  }
}
