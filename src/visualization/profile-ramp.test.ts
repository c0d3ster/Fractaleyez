import { describe, expect, it } from 'vitest'

import { QUALITY_PROFILES } from '../config/quality.config'
import { ProfileRamp } from './profile-ramp'

const FRAME_MS = 1000 / 60

// Runs frames until nothing is left to apply, collecting every change the caller would have to make.
const settle = (ramp: ProfileRamp, maxMs = 5000): Array<ReturnType<ProfileRamp['step']>> => {
  const steps: Array<ReturnType<ProfileRamp['step']>> = []
  for (let elapsed = 0; elapsed < maxMs && !ramp.isSettled(); elapsed += FRAME_MS) steps.push(ramp.step(FRAME_MS))
  return steps
}

describe('ProfileRamp', () => {
  it('applies the first tier at once', () => {
    expect(new ProfileRamp().setTarget(QUALITY_PROFILES.balanced)).toEqual({ fractalScale: 0.75, bloomScale: 0.4, logoBicubic: 0 })
  })

  it('does nothing while the tier stays', () => {
    const ramp = new ProfileRamp()
    ramp.setTarget(QUALITY_PROFILES.quality)
    expect(ramp.step(FRAME_MS)).toEqual({})
    expect(ramp.isSettled()).toBe(true)
  })

  it('moves the fractal and glow resolution toward a new tier in several steps and ends exactly on it', () => {
    const ramp = new ProfileRamp()
    ramp.setTarget(QUALITY_PROFILES.saver)
    ramp.setTarget(QUALITY_PROFILES.quality)
    const changes = settle(ramp)
    const scales = changes.flatMap(({ fractalScale }) => (fractalScale === undefined ? [] : [fractalScale]))
    const blooms = changes.flatMap(({ bloomScale }) => (bloomScale === undefined ? [] : [bloomScale]))
    expect(scales.length).toBeGreaterThan(5)
    expect(scales[scales.length - 1]).toBe(1)
    expect(blooms[blooms.length - 1]).toBe(0.5)
    expect([...scales].sort((a, b) => a - b)).toEqual(scales)
  })

  it('takes a fraction of a second, not instantly and not drawn out', () => {
    const ramp = new ProfileRamp()
    ramp.setTarget(QUALITY_PROFILES.ultra)
    ramp.setTarget(QUALITY_PROFILES.saver)
    let elapsed = 0
    while (!ramp.isSettled()) { ramp.step(FRAME_MS); elapsed += FRAME_MS }
    expect(elapsed).toBeGreaterThan(300)
    expect(elapsed).toBeLessThan(1200)
  })

  it('changes a render target size at most every second frame at 60 fps, not every frame', () => {
    const ramp = new ProfileRamp()
    ramp.setTarget(QUALITY_PROFILES.saver)
    ramp.setTarget(QUALITY_PROFILES.ultra)
    const changes = settle(ramp)
    const resizes = changes.filter(({ fractalScale }) => fractalScale !== undefined).length
    expect(resizes).toBeLessThan(changes.length)
    expect(resizes).toBeLessThanOrEqual(Math.ceil((QUALITY_PROFILES.ultra.fractalScale - QUALITY_PROFILES.saver.fractalScale) / 0.05) + 1)
  })

  it('mixes the logo bicubic filter in and out gradually', () => {
    const ramp = new ProfileRamp()
    ramp.setTarget(QUALITY_PROFILES.quality)
    ramp.setTarget(QUALITY_PROFILES.ultra)
    const mixes = settle(ramp).flatMap(({ logoBicubic }) => (logoBicubic === undefined ? [] : [logoBicubic]))
    expect(mixes.length).toBeGreaterThan(3)
    expect(mixes[mixes.length - 1]).toBe(1)
    expect(mixes.every((mix) => mix > 0 && mix <= 1)).toBe(true)
  })

  it('turns around mid-way when the tier changes again, from where it had got to', () => {
    const ramp = new ProfileRamp()
    ramp.setTarget(QUALITY_PROFILES.saver)
    ramp.setTarget(QUALITY_PROFILES.ultra)
    let last = 0.5
    for (let i = 0; i < 8; i++) last = ramp.step(FRAME_MS).fractalScale ?? last
    expect(last).toBeGreaterThan(0.5)
    ramp.setTarget(QUALITY_PROFILES.saver)
    const back = settle(ramp).flatMap(({ fractalScale }) => (fractalScale === undefined ? [] : [fractalScale]))
    expect(back[0]).toBeLessThanOrEqual(last)
    expect(back[back.length - 1]).toBe(0.5)
  })
})
