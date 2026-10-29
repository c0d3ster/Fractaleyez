import { describe, expect, it } from 'vitest'

import { estimateTempo } from './tempo'

// Onset times for `count` beats at `bpm`, with a little timing wobble.
const beats = (bpm: number, count: number, wobbleMs = 0): number[] =>
  Array.from({ length: count }, (_, i) => i * (60000 / bpm) + (i % 2 === 0 ? wobbleMs : -wobbleMs))

describe('estimateTempo', () => {
  it('reads a steady 135 BPM beat', () => {
    const estimate = estimateTempo(beats(135, 16))
    expect(estimate?.bpm).toBeCloseTo(135, 0)
    expect(estimate?.confidence).toBe(1)
  })

  it('stays close with timing wobble', () => {
    const estimate = estimateTempo(beats(120, 20, 12))
    expect(estimate?.bpm).toBeGreaterThan(117)
    expect(estimate?.bpm).toBeLessThan(123)
    expect(estimate?.confidence).toBeGreaterThan(0.8)
  })

  it('is not thrown off by a missed beat now and then', () => {
    const times = beats(128, 20).filter((_, i) => i % 5 !== 3)
    const estimate = estimateTempo(times)
    expect(estimate?.bpm).toBeCloseTo(128, 0)
    expect(estimate?.confidence).toBeLessThan(1)
  })

  it('folds a double-time reading into the usual range', () => {
    expect(estimateTempo(beats(240, 24))?.bpm).toBeCloseTo(120, 0)
  })

  it('says nothing from too few onsets', () => {
    expect(estimateTempo(beats(120, 4))).toBeNull()
    expect(estimateTempo([])).toBeNull()
  })

  it('gives up on onsets that are not a beat at all', () => {
    const irregular = [0, 130, 620, 700, 1500, 1580, 2900, 3000, 3900, 4600]
    const estimate = estimateTempo(irregular)
    expect(estimate === null || estimate.confidence < 0.5).toBe(true)
  })
})
