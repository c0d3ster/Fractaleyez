/**
 * Who is loading something right now. A layer calls `begin('video')` when it starts loading a clip or a texture and calls the
 * function it gets back when that has finished. Auto does not judge frame times while anything is loading, since shader
 * compiles, decodes and uploads make hitches that say nothing about how heavy the scene is, and the Performance panel shows
 * "loading" instead of its smooth time and leaves those hitches out of its stutter counts.
 */
export class LoadTracker {
  private readonly active = new Map<symbol, string>()
  private lastEndedAt = -Infinity

  constructor(private readonly clock: () => number = () => performance.now()) {}

  /** Starts a load. The returned function ends it, and is safe to call more than once. */
  begin = (reason: string): (() => void) => {
    const token = Symbol(reason)
    this.active.set(token, reason)
    return () => {
      if (this.active.delete(token) && this.active.size === 0) this.lastEndedAt = this.clock()
    }
  }

  isBusy = (): boolean => this.active.size > 0

  /** True while something loads and for `settleMs` after the last load ends, when the frames around it are still hitching. */
  isLoadingOrSettling = (now: number, settleMs: number): boolean => this.active.size > 0 || now - this.lastEndedAt < settleMs

  /** What is loading, without repeats, for a tooltip. */
  reasons = (): string[] => [...new Set(this.active.values())]
}

export const loadTracker = new LoadTracker()
