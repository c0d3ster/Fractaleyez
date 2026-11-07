import { describe, expect, it } from 'vitest'

import { nameRhythm } from './rhythm-pattern'

const BEAT = 60000 / 128
const WINDOW_MS = 12000

// Hits at these places in a bar (in beats from its start), repeated over the window, for one band.
const hits = (positions: number[], beat: number = BEAT): number[] => {
  const bars = Math.ceil(WINDOW_MS / (4 * beat))
  return Array.from({ length: bars }, (_, b) => positions.map((p) => (b * 4 + p) * beat)).flat().filter((t) => t < WINDOW_MS)
}

// Bands: bass, lo, mid, hi, air.
const name = (bass: number[], hi: number[] = [], beat: number = BEAT): string | null =>
  nameRhythm({ bandOnsets: [hits(bass, beat), [], [], hits(hi, beat), []], periodMs: beat })

describe('nameRhythm', () => {
  it('calls a kick on every beat four on the floor, with or without off-beat hats', () => {
    expect(name([0, 1, 2, 3])).toBe('four on the floor')
    expect(name([0, 1, 2, 3], [0.5, 1.5, 2.5, 3.5])).toBe('four on the floor')
  })

  it('keeps four on the floor when a bass note lands between some kicks', () => {
    expect(name([0, 1, 2, 2.75, 3])).toBe('four on the floor')
  })

  it('calls a two-step or a breakbeat syncopated', () => {
    // Drum and bass at 174: kick on 1 and the "and" of 3, snare on 2 and 4.
    const dnb = 60000 / 174
    expect(name([0, 2.5], [1, 3], dnb)).toBe('syncopated')
    // A broken kick: 1, the "and" of 2, 4.
    expect(name([0, 1.5, 3], [1, 3])).toBe('syncopated')
  })

  it('says nothing without a tempo, or with only a few hits (a breakdown)', () => {
    expect(nameRhythm({ bandOnsets: [hits([0, 1, 2, 3]), [], [], [], []], periodMs: null })).toBeNull()
    expect(name([], [0])).toBeNull()
  })

  it('reads the same at any tempo', () => {
    for (const bpm of [100, 128, 140, 174]) expect(name([0, 1, 2, 3], [], 60000 / bpm)).toBe('four on the floor')
  })
})
