/**
 * Who is loading something right now. A layer calls `begin('video')` when it starts loading a clip or a texture and calls the
 * function it gets back when that has finished. Auto does not judge frame times while anything is loading, since shader
 * compiles, decodes and uploads make hitches that say nothing about how heavy the scene is, and the Performance panel shows
 * "loading" instead of its smooth time.
 */
export class LoadTracker {
  private readonly active = new Map<symbol, string>()

  /** Starts a load. The returned function ends it, and is safe to call more than once. */
  begin = (reason: string): (() => void) => {
    const token = Symbol(reason)
    this.active.set(token, reason)
    return () => {
      this.active.delete(token)
    }
  }

  isBusy = (): boolean => this.active.size > 0

  /** What is loading, without repeats, for a tooltip. */
  reasons = (): string[] => [...new Set(this.active.values())]
}

export const loadTracker = new LoadTracker()
