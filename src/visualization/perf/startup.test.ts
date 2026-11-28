import { describe, expect, it } from 'vitest'
import { STARTUP_WATCH_MS, StartupTimeline } from './startup'

// A Performance stand-in with a clock driven by hand.
const fakePerformance = (): { perf: Performance; advance: (ms: number) => void } => {
  let now = 0
  const entries: { name: string; entryType: string; startTime: number; duration: number }[] = []
  const perf = {
    now: () => now,
    mark: (name: string) => {
      entries.push({ name, entryType: 'mark', startTime: now, duration: 0 })
    },
    measure: (name: string, { start, end }: { start: number; end: number }) => {
      entries.push({ name, entryType: 'measure', startTime: start, duration: end - start })
    },
    getEntriesByName: (name: string, type: string) => entries.filter((entry) => entry.name === name && entry.entryType === type),
    getEntriesByType: (type: string) => entries.filter((entry) => entry.entryType === type),
  } as unknown as Performance
  return { perf, advance: (ms) => { now += ms } }
}

describe('StartupTimeline', () => {
  it('says when a stage was reached, and null before it is', () => {
    const { perf, advance } = fakePerformance()
    const timeline = new StartupTimeline(perf)
    expect(timeline.at('video-ready')).toBeNull()
    advance(250)
    timeline.mark('video-ready')
    advance(100)
    timeline.mark('video-ready')
    expect(timeline.at('video-ready')).toBe(250)
  })

  it('resolves a wait for a stage when it is reached, and at once after', async () => {
    const { perf } = fakePerformance()
    const timeline = new StartupTimeline(perf)
    const seen: string[] = []
    const before = timeline.reached('settled').then(() => seen.push('before'))
    await Promise.resolve()
    expect(seen).toEqual([])
    timeline.mark('settled')
    await before
    await timeline.reached('settled').then(() => seen.push('after'))
    expect(seen).toEqual(['before', 'after'])
  })

  it('records stages once, timed steps, and the first frames', () => {
    const { perf, advance } = fakePerformance()
    const timeline = new StartupTimeline(perf)
    advance(100)
    timeline.mark('main')
    advance(50)
    timeline.mark('main')
    const result = timeline.span('pipeline', () => {
      advance(30)
      return 'done'
    })
    expect(result).toBe('done')
    timeline.frame(perf.now())
    ;[16, 16, 80, 16].forEach((gap) => {
      advance(gap)
      timeline.frame(perf.now())
    })
    advance(STARTUP_WATCH_MS)
    timeline.frame(perf.now())

    const report = timeline.report()
    expect(report.marks).toEqual({ main: 100, 'first-frame': 180 })
    expect(report.spans).toEqual({ pipeline: 30 })
    expect(report.frames).toEqual({ count: 4, longestMs: 80, over50: 1 })
  })
})
