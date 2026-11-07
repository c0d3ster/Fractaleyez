import { describe, expect, it } from 'vitest'
import { SectionFeatures, TICK_MS } from './section-features'

const ticksFor = (fps: number, seconds: number, jitterMs = 0): number => {
  const features = new SectionFeatures()
  const frameMs = 1000 / fps
  const levels = [0.5, 0.5, 0.5, 0.5, 0.5]
  const frames = Math.round(seconds * fps)
  Array.from({ length: frames }, (_, i) => i).forEach((i) => {
    const jitter = jitterMs ? ((i * 7) % 5 - 2) * (jitterMs / 2) : 0
    features.push(i * frameMs + jitter, levels, false)
  })
  return features.ticks
}

describe('SectionFeatures tick clock', () => {
  const expected = (10 * 1000) / TICK_MS

  it.each([30, 60, 120])('closes about 20 ticks a second at %i fps', (fps) => {
    expect(Math.abs(ticksFor(fps, 10) - expected)).toBeLessThanOrEqual(2)
  })

  it('holds the rate with frame time jitter at 60 fps', () => {
    expect(Math.abs(ticksFor(60, 10, 1) - expected)).toBeLessThanOrEqual(2)
  })
})
