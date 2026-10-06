import { describe, it, expect } from 'vitest'
import { cosineParam, FULL_WHEEL_SPAN, isFullWheel, pingPong, windowHue } from './hueWindow'

describe('windowHue', () => {
  it('leaves the hue alone for the default full wheel at start 0', () => {
    expect(windowHue(0.37, 0, 1)).toBeCloseTo(0.37)
  })

  it('squeezes the hue into a narrow window', () => {
    expect(windowHue(0, 0.25, 0.1)).toBeCloseTo(0.25)
    expect(windowHue(1, 0.25, 0.1)).toBeCloseTo(0.35)
    expect(windowHue(0.5, 0.25, 0.1)).toBeCloseTo(0.3)
  })

  it('wraps across the red end', () => {
    expect(windowHue(0.75, 0.9, 0.2)).toBeCloseTo(0.05)
    expect(windowHue(0, 0.9, 0.2)).toBeCloseTo(0.9)
  })

  it('rotates a full wheel by the start', () => {
    expect(windowHue(0.5, 0.25, 1)).toBeCloseTo(0.75)
  })
})

describe('cosineParam', () => {
  it('is the untouched palette position for the default window', () => {
    expect(cosineParam(0.42, 0, 1)).toBeCloseTo(0.42)
  })

  it('turns a full wheel by the start', () => {
    expect(cosineParam(0.5, 0.25, 1)).toBeCloseTo(0.25)
  })

  it('keeps a narrow window inside itself as the position drifts', () => {
    const start = 0.1
    const span = 0.2
    for (let position = 0; position < 3; position += 0.037) {
      const hue = -cosineParam(position, start, span)
      const offset = hue - start
      expect(offset).toBeGreaterThanOrEqual(-1e-9)
      expect(offset).toBeLessThanOrEqual(span + 1e-9)
    }
  })
})

describe('pingPong and isFullWheel', () => {
  it('sweeps up and back down', () => {
    expect(pingPong(0)).toBeCloseTo(0)
    expect(pingPong(0.5)).toBeCloseTo(1)
    expect(pingPong(0.75)).toBeCloseTo(0.5)
    expect(pingPong(1.25)).toBeCloseTo(0.5)
  })

  it('treats a near-full span as the whole wheel', () => {
    expect(isFullWheel(1)).toBe(true)
    expect(isFullWheel(FULL_WHEEL_SPAN)).toBe(true)
    expect(isFullWheel(0.9)).toBe(false)
  })
})
