import { describe, expect, it } from 'vitest'

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
