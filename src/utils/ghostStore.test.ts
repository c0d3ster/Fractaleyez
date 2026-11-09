import { describe, expect, it, vi } from 'vitest'
import { ghostKey, GhostStore, sliderGhostFraction, switchGhost } from './ghostStore'

describe('GhostStore', () => {
  it('holds a value per key and drops it with null', () => {
    const store = new GhostStore()
    store.set('effects.kaleidoscope', true)
    store.set('effects.kaleidoscopeCount', 8)
    expect(store.get('effects.kaleidoscope')).toBe(true)
    expect(store.get('effects.kaleidoscopeCount')).toBe(8)
    store.set('effects.kaleidoscope', null)
    expect(store.get('effects.kaleidoscope')).toBeNull()
  })

  it('keeps false as a value, since "wanted off" is not "no ghost"', () => {
    const store = new GhostStore()
    store.set('effects.kaleidoscope', false)
    expect(store.get('effects.kaleidoscope')).toBe(false)
  })

  it('wakes listeners only when something changed, so it can be set every frame', () => {
    const store = new GhostStore()
    const listener = vi.fn()
    store.subscribe(listener)
    store.set('a.b', 4)
    store.set('a.b', 4)
    store.set('a.c', null)
    expect(listener).toHaveBeenCalledTimes(1)
    store.set('a.b', 6)
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('clears by prefix and leaves the rest', () => {
    const store = new GhostStore()
    store.set(ghostKey('effects', 'kaleidoscope'), true)
    store.set(ghostKey('fractal', 'tour'), 40)
    store.clear('effects.')
    expect(store.get('effects.kaleidoscope')).toBeNull()
    expect(store.get('fractal.tour')).toBe(40)
    store.clear()
    expect(store.get('fractal.tour')).toBeNull()
  })

  it('stops waking a listener once it unsubscribes', () => {
    const store = new GhostStore()
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)
    unsubscribe()
    store.set('a.b', 1)
    expect(listener).not.toHaveBeenCalled()
  })
})

describe('switchGhost', () => {
  it('is on for an off switch wanted on, off for an on switch wanted off, and nothing when they agree or there is no ghost', () => {
    expect(switchGhost(true, false)).toBe('on')
    expect(switchGhost(false, true)).toBe('off')
    expect(switchGhost(true, true)).toBeNull()
    expect(switchGhost(false, false)).toBeNull()
    expect(switchGhost(null, true)).toBeNull()
    expect(switchGhost(8, true)).toBeNull()
  })
})

describe('sliderGhostFraction', () => {
  it('places the ghost along the track', () => {
    expect(sliderGhostFraction(75, 50, 0, 100)).toBe(0.75)
    expect(sliderGhostFraction(2, 10, 2, 20)).toBe(0)
  })

  it('stays on the track when the ghost is out of range', () => {
    expect(sliderGhostFraction(150, 50, 0, 100)).toBe(1)
    expect(sliderGhostFraction(-5, 50, 0, 100)).toBe(0)
  })

  it('is hidden when there is no numeric ghost or it sits on the thumb', () => {
    expect(sliderGhostFraction(null, 50, 0, 100)).toBeNull()
    expect(sliderGhostFraction(true, 50, 0, 100)).toBeNull()
    expect(sliderGhostFraction(50, 50, 0, 100)).toBeNull()
  })
})
