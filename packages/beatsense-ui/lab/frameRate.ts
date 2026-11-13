// How many frames arrived from the capture worklet in the last second (it posts 60 a second while audio flows into it).

const WINDOW_MS = 1000

export class FrameRate {
  private readonly arrivals: number[] = []

  /** Call once per frame, with the page clock when it arrived. */
  count = (nowMs: number): void => {
    this.arrivals.push(nowMs)
    this.trim(nowMs)
  }

  /** Frames a second, over the last second. */
  perSecond = (nowMs: number): number => {
    this.trim(nowMs)
    return (this.arrivals.length * 1000) / WINDOW_MS
  }

  private trim = (nowMs: number): void => {
    while (this.arrivals.length > 0 && nowMs - (this.arrivals[0] ?? nowMs) > WINDOW_MS) this.arrivals.shift()
  }
}
