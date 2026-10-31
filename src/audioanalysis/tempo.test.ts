import { describe, expect, it } from 'vitest'

import { estimateTempo } from './tempo'

// Onset times for `count` beats at `bpm`, with a little timing wobble.
const beats = (bpm: number, count: number, wobbleMs = 0): number[] =>
  Array.from({ length: count }, (_, i) => i * (60000 / bpm) + (i % 2 === 0 ? wobbleMs : -wobbleMs))

describe('estimateTempo', () => {
  it('reads a steady 135 BPM beat', () => {
    const estimate = estimateTempo(beats(135, 16))
    expect(estimate?.bpm).toBeCloseTo(135, 0)
    expect(estimate?.consistency).toBe(1)
  })

  it('stays close with timing wobble', () => {
    const estimate = estimateTempo(beats(120, 20, 12))
    expect(estimate?.bpm).toBeGreaterThan(117)
    expect(estimate?.bpm).toBeLessThan(123)
    expect(estimate?.consistency).toBeGreaterThan(0.8)
  })

  it('is not thrown off by a missed beat now and then', () => {
    const times = beats(128, 20).filter((_, i) => i % 5 !== 3)
    const estimate = estimateTempo(times)
    expect(estimate?.bpm).toBeCloseTo(128, 0)
    expect(estimate?.consistency).toBeLessThan(1)
  })

  it('folds a double-time reading into the usual range', () => {
    expect(estimateTempo(beats(240, 24))?.bpm).toBeCloseTo(120, 0)
  })

  it('finds the beat under syncopation, where neighboring gaps are uneven', () => {
    const beat = 60000 / 128
    const bar = (positions: number[]): number[] => Array.from({ length: 8 }, (_, b) => positions.map((p) => (b * 4 + p) * beat)).flat()
    for (const positions of [[0, 2, 2.5, 3], [0, 1.5, 3], [0, 1.5, 2.5, 3]]) {
      expect(estimateTempo(bar(positions))?.bpm).toBeCloseTo(128, -0.5)
    }
  })

  it('reads a half-time pattern as steady', () => {
    const beat = 60000 / 128
    const times = Array.from({ length: 16 }, (_, i) => i * 2 * beat)
    const estimate = estimateTempo(times)
    expect(estimate?.bpm).toBeCloseTo(128, 0)
    expect(estimate?.consistency).toBe(1)
  })

  it('says nothing from too few onsets', () => {
    expect(estimateTempo(beats(120, 4))).toBeNull()
    expect(estimateTempo([])).toBeNull()
  })

  it('gives up on onsets that are not a beat at all', () => {
    const irregular = [0, 130, 620, 700, 1500, 1580, 2900, 3000, 3900, 4600]
    const estimate = estimateTempo(irregular)
    expect(estimate === null || estimate.consistency < 0.5).toBe(true)
  })
})
