import { describe, expect, it, vi } from 'vitest'

import { BeatMonitor, BeatSample } from './beat'

const sample = (t: number, beatBand: number | null): BeatSample => ({ t, bands: [], beatBand })

describe('BeatMonitor.getLastBeatTime', () => {
  it('is null until a beat has fired', () => {
    const monitor = new BeatMonitor()
    monitor.record(sample(10, null))
    expect(monitor.getLastBeatTime()).toBeNull()
  })

  it('is the time of the latest beat, ignoring frames without one', () => {
    const monitor = new BeatMonitor()
    monitor.record(sample(10, null))
    monitor.record(sample(20, 1))
    monitor.record(sample(30, null))
    expect(monitor.getLastBeatTime()).toBe(20)
    monitor.record(sample(40, 0))
    expect(monitor.getLastBeatTime()).toBe(40)
  })

  it('keeps reporting the last beat after the timeline has trimmed it away', () => {
    const monitor = new BeatMonitor()
    monitor.record(sample(0, 0))
    monitor.record(sample(60000, null))
    expect(monitor.getTimeline().samples.some(({ beatBand }) => beatBand !== null)).toBe(false)
    expect(monitor.getLastBeatTime()).toBe(0)
  })
})

describe('BeatMonitor.subscribe', () => {
  it('calls the listener on frames that carry a beat only', () => {
    const monitor = new BeatMonitor()
    const listener = vi.fn()
    monitor.subscribe(listener)
    monitor.record(sample(10, null))
    expect(listener).not.toHaveBeenCalled()
    monitor.record(sample(20, 1))
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('stops calling the listener once unsubscribed', () => {
    const monitor = new BeatMonitor()
    const listener = vi.fn()
    const unsubscribe = monitor.subscribe(listener)
    unsubscribe()
    monitor.record(sample(20, 0))
    expect(listener).not.toHaveBeenCalled()
  })

  it('drops a listener that throws and keeps serving the others', () => {
    const monitor = new BeatMonitor()
    const good = vi.fn()
    monitor.subscribe(() => {
      throw new Error('window closed')
    })
    monitor.subscribe(good)
    expect(() => monitor.record(sample(10, 0))).not.toThrow()
    monitor.record(sample(20, 0))
    expect(good).toHaveBeenCalledTimes(2)
  })
})
