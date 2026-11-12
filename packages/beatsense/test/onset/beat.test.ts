import { describe, expect, it, vi } from 'vitest'

import { BeatMonitor, BeatSample } from '../../src/onset/beat'

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

describe('BeatMonitor.getBandOnsets', () => {
  const band = (rising: boolean): { level: number; loudness: number; trigger: number; rising: boolean } => ({ level: 1, loudness: 1, trigger: 1, rising })
  const frame = (t: number, rising: boolean[]): BeatSample => ({ t, bands: rising.map(band), beatBand: null })

  it('keeps each band\'s own onsets, whether or not a beat fired', () => {
    vi.spyOn(performance, 'now').mockReturnValue(1000)
    const monitor = new BeatMonitor()
    monitor.record(frame(100, [true, false, false, true, false]))
    monitor.record(frame(500, [false, true, false, false, false]))
    expect(monitor.getBandOnsets()).toEqual([[100], [500], [], [100], []])
    vi.restoreAllMocks()
  })

  it('counts rises closer than 100 ms in one band as one hit', () => {
    vi.spyOn(performance, 'now').mockReturnValue(1000)
    const monitor = new BeatMonitor()
    for (const t of [100, 150, 210, 260]) monitor.record(frame(t, [true]))
    expect(monitor.getBandOnsets()[0]).toEqual([100, 210])
    vi.restoreAllMocks()
  })

  it('forgets onsets older than the tempo window', () => {
    const monitor = new BeatMonitor()
    monitor.record(frame(0, [true]))
    monitor.record(frame(20000, [true]))
    vi.spyOn(performance, 'now').mockReturnValue(20000)
    expect(monitor.getBandOnsets()[0]).toEqual([20000])
    vi.restoreAllMocks()
  })
})
