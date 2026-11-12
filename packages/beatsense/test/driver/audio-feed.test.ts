import { describe, expect, it, vi } from 'vitest'

import { AudioFeed, createAnalysers, DEFAULT_FEED_SETTINGS, type AudioFrame } from '../../src'

const frame = (over: Partial<AudioFrame> = {}): AudioFrame => ({ t: 1000, deltaMs: 16, levels: [5, 4, 3, 2, 1], energy: 3, ...over })

describe('AudioFeed (driver)', () => {
  it('reads the settings every frame', () => {
    const settings = vi.fn(() => DEFAULT_FEED_SETTINGS)
    const feed = new AudioFeed(createAnalysers(), { settings })
    feed.push(frame())
    feed.push(frame({ t: 1016 }))
    expect(settings).toHaveBeenCalledTimes(2)
  })

  it('stamps the beat monitor with the frame time, not a clock', () => {
    const analysers = createAnalysers(() => 5000)
    const record = vi.spyOn(analysers.beatMonitor, 'record')
    new AudioFeed(analysers).push(frame({ t: 1234 }))
    expect(record.mock.calls[0]![0].t).toBe(1234)
  })

  it('holds the drum, riser and sweep detectors until the first sound', () => {
    const analysers = createAnalysers()
    const drums = vi.spyOn(analysers.drumHits, 'push')
    const riser = vi.spyOn(analysers.riserDetector, 'push')
    const feed = new AudioFeed(analysers)
    feed.push(frame({ energy: 0 }))
    expect(feed.isSilent()).toBe(true)
    expect(drums).not.toHaveBeenCalled()
    expect(riser).not.toHaveBeenCalled()
    feed.push(frame({ t: 1016, energy: 2 }))
    expect(feed.isSilent()).toBe(false)
    expect(drums).toHaveBeenCalledTimes(1)
    expect(riser).toHaveBeenCalledTimes(1)
  })

  it('feeds the sweep detector the frame spectrum, and skips the riser and sweep while unread, restarting them on return', () => {
    const analysers = createAnalysers()
    const sweep = vi.spyOn(analysers.sweepDetector, 'push')
    const riser = vi.spyOn(analysers.riserDetector, 'push')
    const riserReset = vi.spyOn(analysers.riserDetector, 'reset')
    const sweepReset = vi.spyOn(analysers.sweepDetector, 'reset')
    let reads = true
    const feed = new AudioFeed(analysers, { readsRiserAndSweep: (): boolean => reads })
    const spectrum = new Uint8Array(40)
    feed.push(frame({ spectrum }))
    expect(sweep).toHaveBeenCalledWith(1000, spectrum)
    reads = false
    expect(feed.wantsSpectrum()).toBe(false)
    feed.push(frame({ t: 1016 }))
    expect(riser).toHaveBeenCalledTimes(1)
    expect(riserReset).not.toHaveBeenCalled()
    reads = true
    feed.push(frame({ t: 1032, spectrum }))
    expect(riserReset).toHaveBeenCalledTimes(1)
    expect(sweepReset).toHaveBeenCalledTimes(1)
    expect(riser).toHaveBeenCalledTimes(2)
  })

  it('pushes the tempo tracker before the grid and the section tracker last', () => {
    const analysers = createAnalysers()
    const order: string[] = []
    vi.spyOn(analysers.tempoTracker, 'push').mockImplementation((): void => void order.push('tempo'))
    vi.spyOn(analysers.beatGrid, 'push').mockImplementation((): boolean => {
      order.push('grid')
      return false
    })
    vi.spyOn(analysers.sectionTracker, 'push').mockImplementation((): void => void order.push('sections'))
    new AudioFeed(analysers).push(frame())
    expect(order).toEqual(['tempo', 'grid', 'sections'])
  })
})
