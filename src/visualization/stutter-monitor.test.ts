import { describe, expect, it } from 'vitest'

import { STUTTER_MS, STUTTER_WINDOW_MS, StutterMonitor } from './stutter-monitor'

describe('StutterMonitor', () => {
  it('counts only gaps over the threshold', () => {
    const monitor = new StutterMonitor()
    monitor.record(1000, STUTTER_MS)
    monitor.record(1100, STUTTER_MS + 1)
    monitor.record(1200, 16)
    expect(monitor.summary(1300).count).toBe(1)
  })

  it('reports the worst gap', () => {
    const monitor = new StutterMonitor()
    monitor.record(1000, STUTTER_MS + 20)
    monitor.record(2000, STUTTER_MS + 90)
    monitor.record(3000, STUTTER_MS + 40)
    expect(monitor.summary(4000)).toEqual({ count: 3, worstMs: STUTTER_MS + 90 })
  })

  it('forgets stutters older than the window', () => {
    const monitor = new StutterMonitor()
    monitor.record(0, STUTTER_MS + 50)
    monitor.record(STUTTER_WINDOW_MS / 2, STUTTER_MS + 30)
    expect(monitor.summary(STUTTER_WINDOW_MS + 1)).toEqual({ count: 1, worstMs: STUTTER_MS + 30 })
  })

  it('leaves out gaps the skip rule rejects, such as those while the page loads', () => {
    let loading = true
    const monitor = new StutterMonitor(() => loading)
    monitor.record(1000, STUTTER_MS + 150)
    loading = false
    monitor.record(2000, STUTTER_MS + 40)
    expect(monitor.summary(3000)).toEqual({ count: 1, worstMs: STUTTER_MS + 40 })
  })

  it('has nothing to report at the start', () => {
    expect(new StutterMonitor().summary(0)).toEqual({ count: 0, worstMs: 0 })
  })
})
