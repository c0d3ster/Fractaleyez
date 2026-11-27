// The startup timeline: when each stage of loading happened, how long the heavy steps took, and how smooth the first seconds were. Marks
// and spans go through the User Timing API (performance.mark and measure), so they also show in a DevTools Performance recording. It is
// always on (a handful of marks per load); `window.perfProbe.startup()` reads it, and with `?perf=1` it is logged once loading is over.

const PREFIX = 'fx:'
// The first frames are watched for this long: what a visitor sees as "the load".
export const STARTUP_WATCH_MS = 10000
const HITCH_MS = 50

export type StartupReport = {
  /** When each stage was reached, in ms since the page started loading. */
  marks: Record<string, number>
  /** How long each timed step took, in ms (the step's own time, on the main thread). */
  spans: Record<string, number>
  /** When the files that matter most finished downloading, in ms since the page started loading, and their size in KB (0 when cached). */
  downloads: Record<string, { at: number; kb: number }>
  /** The first frames, from the first one drawn until STARTUP_WATCH_MS later. */
  frames: { count: number; longestMs: number; over50: number }
}

const round = (ms: number): number => Math.round(ms)

export class StartupTimeline {
  private firstFrameAt: number | null = null
  private lastFrameAt = 0
  private frameCount = 0
  private longestMs = 0
  private over50 = 0

  constructor(private readonly perf: Performance = performance) {}

  /** Notes that a stage was reached. Only the first time counts. */
  mark = (name: string): void => {
    if (this.perf.getEntriesByName(PREFIX + name, 'mark').length > 0) return
    this.perf.mark(PREFIX + name)
  }

  /** Runs a step and records how long it took. */
  span = <T>(name: string, run: () => T): T => {
    const start = this.perf.now()
    try {
      return run()
    } finally {
      this.perf.measure(PREFIX + name, { start, end: this.perf.now() })
    }
  }

  /** Called once per drawn frame: marks the first and counts long gaps until the watch ends. */
  frame = (now: number): void => {
    if (this.firstFrameAt === null) {
      this.firstFrameAt = now
      this.lastFrameAt = now
      this.mark('first-frame')
      return
    }
    if (now - this.firstFrameAt > STARTUP_WATCH_MS) return
    const gap = now - this.lastFrameAt
    this.lastFrameAt = now
    this.frameCount++
    this.longestMs = Math.max(this.longestMs, gap)
    if (gap > HITCH_MS) this.over50++
  }

  report = (): StartupReport => {
    const marks: Record<string, number> = {}
    const spans: Record<string, number> = {}
    this.perf.getEntriesByType('paint').forEach((entry) => {
      marks[entry.name] = round(entry.startTime)
    })
    this.perf.getEntriesByType('mark').filter(({ name }) => name.startsWith(PREFIX)).forEach((entry) => {
      marks[entry.name.slice(PREFIX.length)] = round(entry.startTime)
    })
    this.perf.getEntriesByType('measure').filter(({ name }) => name.startsWith(PREFIX)).forEach((entry) => {
      spans[entry.name.slice(PREFIX.length)] = round(entry.duration)
    })
    const downloads: StartupReport['downloads'] = {}
    ;(this.perf.getEntriesByType('resource') as PerformanceResourceTiming[])
      .filter(({ name }) => /\.(js|mp4|webm)(\?|$)/.test(name))
      .forEach((entry) => {
        const file = entry.name.split('?')[0]!.split('/').pop() ?? entry.name
        downloads[file] = { at: round(entry.responseEnd), kb: Math.round(entry.transferSize / 1024) }
      })
    return { marks, spans, downloads, frames: { count: this.frameCount, longestMs: round(this.longestMs), over50: this.over50 } }
  }
}

/** The page's startup timeline. */
export const startupTimeline = new StartupTimeline()

/** The report as console tables, sorted by time (only with the perf probe on, so the tables are wanted). */
/* eslint-disable no-console */
export const logStartupReport = (report: StartupReport): void => {
  const byTime = (entries: [string, number][]): Record<string, number> => Object.fromEntries(entries.sort((a, b) => a[1] - b[1]))
  console.info('Startup: stages (ms since the page started loading)')
  console.table(byTime(Object.entries(report.marks)))
  console.info('Startup: steps (ms each)')
  console.table(report.spans)
  console.info('Startup: downloads')
  console.table(report.downloads)
  console.info(`Startup: first ${STARTUP_WATCH_MS / 1000}s of frames`, report.frames)
}
/* eslint-enable no-console */
