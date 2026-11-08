import { describe, expect, it } from 'vitest'

import { ColorState } from './colorState'
import { ColorFollower } from './colorTransition'

const lutOf = (value: number): Uint8Array => new Uint8Array(16).fill(value)

const target = (overrides: Partial<ColorState> = {}): ColorState => ({
  key: 'a',
  saturation: 1,
  rangeStart: 0,
  rangeEnd: 1,
  phase: 0,
  cycles: 1,
  lut: lutOf(0),
  baseLut: lutOf(0),
  rangeLut: lutOf(0),
  ...overrides,
})

const CROSSFADE_MS = 1000
const FRAME_MS = 1000 / 60

// Runs the follower for `ms` of 60 fps frames and returns what it showed last.
const run = (follower: ColorFollower, to: ColorState, ms: number): ReturnType<ColorFollower['step']> => {
  let shown = follower.current()
  for (let elapsed = 0; elapsed < ms; elapsed += FRAME_MS) shown = follower.step(to, FRAME_MS, CROSSFADE_MS)
  return shown
}

describe('ColorFollower', () => {
  it('shows the first target at once, so nothing fades in on load', () => {
    const shown = new ColorFollower().step(target({ key: 'first', saturation: 0.4, phase: 0.3, lut: lutOf(200) }), FRAME_MS, CROSSFADE_MS)
    expect(shown).toMatchObject({ key: 'first', saturation: 0.4, phase: 0.3 })
    expect(Array.from(shown.lut)).toEqual(Array.from(lutOf(200)))
  })

  it('eases a palette change instead of jumping, and is most of the way there after the crossfade time', () => {
    const follower = new ColorFollower()
    follower.step(target(), FRAME_MS, CROSSFADE_MS)
    const next = target({ key: 'b', lut: lutOf(200) })
    const early = run(follower, next, 100)
    expect(early.lut[0]).toBeGreaterThan(0)
    expect(early.lut[0]).toBeLessThan(60)
    const done = run(follower, next, CROSSFADE_MS - 100)
    expect(done.lut[0]).toBeGreaterThan(200 * 0.9)
    expect(done.lut[0]).toBeLessThan(200)
  })

  it('moves saturation, phase and cycles the same way', () => {
    const follower = new ColorFollower()
    follower.step(target(), FRAME_MS, CROSSFADE_MS)
    const shown = run(follower, target({ key: 'b', saturation: 0, phase: 0.5, cycles: 3 }), CROSSFADE_MS / 2)
    expect(shown.saturation).toBeGreaterThan(0.1)
    expect(shown.saturation).toBeLessThan(0.9)
    expect(shown.phase).toBeGreaterThan(0.1)
    expect(shown.phase).toBeLessThan(0.45)
    expect(shown.cycles).toBeGreaterThan(1.5)
    expect(shown.cycles).toBeLessThan(2.9)
  })

  it('lands exactly on the target and then keeps its key, so renderers stop rebuilding', () => {
    const follower = new ColorFollower()
    follower.step(target(), FRAME_MS, CROSSFADE_MS)
    const next = target({ key: 'b', saturation: 0.5, lut: lutOf(120) })
    const moving = run(follower, next, 200)
    expect(moving.key).not.toBe('b')
    const done = run(follower, next, 6000)
    expect(done.key).toBe('b')
    expect(done.saturation).toBe(0.5)
    expect(Array.from(done.lut)).toEqual(Array.from(lutOf(120)))
  })

  it('changes the key on every frame the colors move, so a renderer notices each one', () => {
    const follower = new ColorFollower()
    follower.step(target(), FRAME_MS, CROSSFADE_MS)
    const next = target({ key: 'b', lut: lutOf(255) })
    const keys = new Set<string>()
    for (let i = 0; i < 10; i++) keys.add(follower.step(next, FRAME_MS, CROSSFADE_MS).key)
    expect(keys.size).toBe(10)
  })

  it('keeps moving while the target changes every frame, as when a slider is dragged', () => {
    const follower = new ColorFollower()
    follower.step(target(), FRAME_MS, CROSSFADE_MS)
    let shown = follower.current()
    for (let i = 1; i <= 60; i++) shown = follower.step(target({ key: `drag${i}`, saturation: i / 60 }), FRAME_MS, CROSSFADE_MS)
    // A fade restarted on each change would still be at the start; this follows the hand a little behind it.
    expect(shown.saturation).toBeGreaterThan(0.4)
    expect(shown.saturation).toBeLessThan(1)
  })

  it('is a plain cut with a crossfade of 0', () => {
    const follower = new ColorFollower()
    follower.step(target(), FRAME_MS, 0)
    const shown = follower.step(target({ key: 'b', saturation: 0.2, lut: lutOf(90) }), FRAME_MS, 0)
    expect(shown).toMatchObject({ key: 'b', saturation: 0.2 })
    expect(shown.lut[0]).toBe(90)
  })

  it('does no work while settled on the target', () => {
    const follower = new ColorFollower()
    const settled = target({ key: 'steady', lut: lutOf(77) })
    const first = follower.step(settled, FRAME_MS, CROSSFADE_MS)
    const before = Array.from(first.lut)
    for (let i = 0; i < 5; i++) expect(follower.step(settled, FRAME_MS, CROSSFADE_MS)).toBe(first)
    expect(Array.from(first.lut)).toEqual(before)
  })

  it('does not move when no time passes', () => {
    const follower = new ColorFollower()
    follower.step(target(), FRAME_MS, CROSSFADE_MS)
    const shown = follower.step(target({ key: 'b', lut: lutOf(200) }), 0, CROSSFADE_MS)
    expect(shown.lut[0]).toBe(0)
  })
})
