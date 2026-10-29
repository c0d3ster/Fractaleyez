import { describe, expect, it } from 'vitest'

import { LoadTracker } from './load-tracker'

describe('LoadTracker', () => {
  it('is busy from the start of a load until it ends', () => {
    const tracker = new LoadTracker()
    expect(tracker.isBusy()).toBe(false)
    const end = tracker.begin('video')
    expect(tracker.isBusy()).toBe(true)
    end()
    expect(tracker.isBusy()).toBe(false)
  })

  it('stays busy until every load has ended', () => {
    const tracker = new LoadTracker()
    const endVideo = tracker.begin('video')
    const endSprite = tracker.begin('sprite')
    endVideo()
    expect(tracker.isBusy()).toBe(true)
    endSprite()
    expect(tracker.isBusy()).toBe(false)
  })

  it('lets a load be ended twice without ending another one', () => {
    const tracker = new LoadTracker()
    const endFirst = tracker.begin('sprite')
    tracker.begin('sprite')
    endFirst()
    endFirst()
    expect(tracker.isBusy()).toBe(true)
  })

  it('names what is loading once, however many are', () => {
    const tracker = new LoadTracker()
    tracker.begin('sprite')
    tracker.begin('sprite')
    tracker.begin('video')
    expect(tracker.reasons().sort()).toEqual(['sprite', 'video'])
  })

  it('counts as loading until a moment after the last load ends', () => {
    let time = 0
    const tracker = new LoadTracker(() => time)
    const end = tracker.begin('video')
    expect(tracker.isLoadingOrSettling(100, 500)).toBe(true)
    time = 1000
    end()
    expect(tracker.isLoadingOrSettling(1200, 500)).toBe(true)
    expect(tracker.isLoadingOrSettling(1600, 500)).toBe(false)
  })

  it('is not loading before anything has loaded', () => {
    expect(new LoadTracker(() => 0).isLoadingOrSettling(0, 500)).toBe(false)
  })

  it('stays loading while another load is still going when one ends', () => {
    let time = 0
    const tracker = new LoadTracker(() => time)
    const endFirst = tracker.begin('video')
    tracker.begin('sprite')
    time = 1000
    endFirst()
    expect(tracker.isLoadingOrSettling(5000, 500)).toBe(true)
  })
})
