/** The parts of a Long Animation Frame entry the recorder reads (the DOM typings do not have it yet). */
type LoafScript = { invoker?: string; invokerType?: string; sourceFunctionName?: string; duration: number }
type LoafEntry = PerformanceEntry & { blockingDuration?: number; scripts?: LoafScript[] }

export type LongFrameScript = { invoker: string; ms: number }
export type LongFrame = { atMs: number; durationMs: number; blockingMs: number; scripts: LongFrameScript[] }

export type LongFrameSummary = {
  /** False where the browser has no Long Animation Frames API (anything but Chromium 123 and later). */
  supported: boolean
  count: number
  blockingTotalMs: number
  /** The longest few, with what ran in them. */
  worst: LongFrame[]
  /** Who ran script during long frames, by total time. */
  topInvokers: Array<{ invoker: string; count: number; totalMs: number }>
}

const MAX_KEPT = 300
const WORST_SHOWN = 5
const INVOKERS_SHOWN = 8

const label = ({ invoker, invokerType, sourceFunctionName }: LoafScript): string => {
  const base = invoker || invokerType || 'unknown'
  return sourceFunctionName ? `${base} ${sourceFunctionName}` : base
}

const round = (value: number): number => Math.round(value * 10) / 10

/**
 * Records the Long Animation Frames of one window: each frame that took over 50 ms from the start of its work to its paint, with the
 * scripts that ran in it. A window has its own list, so the pop-out config window is watched separately from the page: its React
 * work shows up in the page's frames (it runs on the page's thread), while its style, layout and paint show up in its own.
 */
export class LongFrameRecorder {
  private readonly frames: LongFrame[] = []
  private observer: PerformanceObserver | null = null
  private readonly supported: boolean

  constructor(win: Window) {
    const Observer = (win as Window & { PerformanceObserver?: typeof PerformanceObserver }).PerformanceObserver
    this.supported = Boolean(Observer?.supportedEntryTypes?.includes('long-animation-frame'))
    if (!Observer || !this.supported) return
    try {
      this.observer = new Observer((list) => list.getEntries().forEach((entry) => this.record(entry as LoafEntry)))
      this.observer.observe({ type: 'long-animation-frame', buffered: false })
    } catch {
      this.observer = null
    }
  }

  clear = (): void => {
    this.frames.length = 0
  }

  disconnect = (): void => {
    this.observer?.disconnect()
    this.observer = null
  }

  summary = (): LongFrameSummary => {
    const byInvoker = new Map<string, { count: number; totalMs: number }>()
    this.frames.forEach(({ scripts }) => scripts.forEach(({ invoker, ms }) => {
      const entry = byInvoker.get(invoker) ?? { count: 0, totalMs: 0 }
      entry.count++
      entry.totalMs += ms
      byInvoker.set(invoker, entry)
    }))
    return {
      supported: this.supported,
      count: this.frames.length,
      blockingTotalMs: round(this.frames.reduce((sum, { blockingMs }) => sum + blockingMs, 0)),
      worst: [...this.frames].sort((a, b) => b.durationMs - a.durationMs).slice(0, WORST_SHOWN),
      topInvokers: [...byInvoker.entries()]
        .map(([invoker, { count, totalMs }]) => ({ invoker, count, totalMs: round(totalMs) }))
        .sort((a, b) => b.totalMs - a.totalMs)
        .slice(0, INVOKERS_SHOWN),
    }
  }

  private record = (entry: LoafEntry): void => {
    const scripts = (entry.scripts ?? [])
      .map((script) => ({ invoker: label(script), ms: round(script.duration) }))
      .sort((a, b) => b.ms - a.ms)
      .slice(0, 4)
    this.frames.push({ atMs: round(entry.startTime), durationMs: round(entry.duration), blockingMs: round(entry.blockingDuration ?? 0), scripts })
    if (this.frames.length > MAX_KEPT) this.frames.shift()
  }
}
