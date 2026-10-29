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
})
