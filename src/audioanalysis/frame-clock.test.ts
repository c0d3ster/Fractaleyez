import { describe, expect, it } from 'vitest'

import { FrameClock } from './frame-clock'

const HOP = 1000 / 60

describe('FrameClock', () => {
  it('follows the page clock one to one when frames arrive on time', () => {
    const clock = new FrameClock()
    const times = Array.from({ length: 120 }, (_, n) => clock.toPageMs(n * HOP, 5000 + n * HOP + 3))
    times.forEach((time, n) => expect(time).toBeCloseTo(5003 + n * HOP, 6))
  })

  it('keeps frames about a hop apart when a stalled thread gets them in a burst', () => {
    const clock = new FrameClock()
    for (let n = 0; n < 60; n++) clock.toPageMs(n * HOP, 1000 + n * HOP)
    // 10 frames (167 ms) arrive at once.
    const burst = Array.from({ length: 10 }, (_, k) => clock.toPageMs((60 + k) * HOP, 1000 + 70 * HOP))
    burst.slice(1).forEach((time, k) => expect(time - burst[k]!).toBeGreaterThan(HOP - 0.6))
  })

  it('follows a slow drift of the audio clock against the page clock', () => {
    const clock = new FrameClock()
    let last = 0
    // The audio clock runs 0.01% slow: the page's clock gains 0.0017 ms a frame.
    for (let n = 0; n < 6000; n++) last = clock.toPageMs(n * HOP, 1000 + n * HOP * 1.0001)
    expect(Math.abs(last - (1000 + 5999 * HOP * 1.0001))).toBeLessThan(0.05)
  })
})
