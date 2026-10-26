import { describe, expect, it } from 'vitest'

import { shouldDrawUnderCap } from './frame-cap'

// Count the frames drawn over `seconds` of a display at `hz` under a cap.
const drawnPerSecond = (hz: number, capFps: number, seconds = 10): number => {
  const frameMs = 1000 / hz
  let last = 0
  let drawn = 0
  for (let i = 1; i <= hz * seconds; i++) {
    const now = i * frameMs
    if (!shouldDrawUnderCap(now - last, capFps, frameMs)) continue
    last = now
    drawn++
  }
  return drawn / seconds
}

describe('shouldDrawUnderCap', () => {
  it('halves a 240Hz display under a 120 cap', () => {
    expect(drawnPerSecond(240, 120)).toBeCloseTo(120, 0)
  })

  it('does not halve a 144Hz display under a 120 cap', () => {
    expect(drawnPerSecond(144, 120)).toBeCloseTo(144, 0)
  })

  it('leaves a display slower than the cap alone', () => {
    expect(drawnPerSecond(60, 120)).toBeCloseTo(60, 0)
  })

  it('keeps a 30 cap at 30 on a 60Hz display', () => {
    expect(drawnPerSecond(60, 30)).toBeCloseTo(30, 0)
  })

  it('draws a late frame after a stall', () => {
    expect(shouldDrawUnderCap(200, 120, 4)).toBe(true)
  })
})
