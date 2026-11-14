import { describe, expect, it } from 'vitest'

import { alignPasses, correlationAt, isSureAlignment, onsetEnvelope } from '../../lab/recording/align'
import { FRAME_MS, passOf, syntheticSongLevels } from './syntheticFrames'

const SONG = syntheticSongLevels(120, 7)

describe('onsetEnvelope', () => {
  it('is the same at any volume', () => {
    const quiet = onsetEnvelope(passOf(SONG, 0, 600, { gain: 0.25 })).values
    const loud = onsetEnvelope(passOf(SONG, 0, 600, { gain: 4 })).values
    quiet.forEach((value, i) => expect(value).toBeCloseTo(loud[i]!, 1))
  })

  it('counts no jump across a missing frame', () => {
    const frames = passOf(SONG, 0, 100)
    const gapped = [...frames.slice(0, 50), ...frames.slice(51)]
    const { values } = onsetEnvelope(gapped)
    expect(values).toHaveLength(100)
    expect(values[51]).toBe(0)
  })
})

describe('correlationAt', () => {
  it('needs enough overlap', () => {
    const a = Float64Array.from([1, 2, 3, 4])
    expect(correlationAt(a, a, 0, 4)).toBeCloseTo(1)
    expect(correlationAt(a, a, 1, 4)).toBeNull()
  })
})

describe('alignPasses', () => {
  it('finds where a later pass starts in the song, on a different clock and volume, to within a few ms', () => {
    const reference = passOf(SONG, 0, 60 * 90, { clockMs: 5000 })
    // The second pass started 23.4 s into the song, heard at half the volume, with noise, on a clock that started elsewhere.
    const pass = passOf(SONG, 1404, 60 * 110, { clockMs: 987654.3, gain: 0.5, noise: 0.2, seed: 3 })
    const alignment = alignPasses(reference, pass)!
    // Pass frame 0 is song frame 1404, which the reference heard at 5000 + 1404 frames.
    const expected = 5000 + 1404 * FRAME_MS - 987654.3
    expect(Math.abs(alignment.offsetMs - expected)).toBeLessThan(5)
    expect(alignment.score).toBeGreaterThan(0.9)
    expect(isSureAlignment(alignment)).toBe(true)
    expect(alignment.overlapMs).toBeGreaterThan(60000)
  })

  it('aligns a pass that started before the reference did', () => {
    const reference = passOf(SONG, 1800, 60 * 100, { clockMs: 0 })
    const pass = passOf(SONG, 0, 60 * 60, { clockMs: 0, seed: 5, noise: 0.1 })
    const alignment = alignPasses(reference, pass)!
    expect(Math.abs(alignment.offsetMs - -1800 * FRAME_MS)).toBeLessThan(5)
  })

  it('searches only around a hint when given one', () => {
    const reference = passOf(SONG, 0, 60 * 90)
    const pass = passOf(SONG, 1404, 60 * 110, { seed: 3, noise: 0.1 })
    const truth = 1404 * FRAME_MS
    expect(Math.abs(alignPasses(reference, pass, { hint: { offsetMs: truth + 300, withinMs: 1000 } })!.offsetMs - truth)).toBeLessThan(5)
    // A hint that rules the true offset out finds something else, a much worse match.
    const wrong = alignPasses(reference, pass, { hint: { offsetMs: truth + 20000, withinMs: 1000 } })!
    expect(Math.abs(wrong.offsetMs - truth)).toBeGreaterThan(15000)
    expect(wrong.score).toBeLessThan(0.7)
  })

  it('is not sure of another song at the same tempo, and gives nothing without enough overlap', () => {
    const other = syntheticSongLevels(60, 99)
    const alignment = alignPasses(passOf(SONG, 0, 3600), passOf(other, 0, 3600))!
    // The beat alone correlates; nothing stands out from the other offsets.
    expect(isSureAlignment(alignment)).toBe(false)
    expect(alignPasses(passOf(SONG, 0, 300), passOf(SONG, 0, 300))).toBeNull()
  })
})

describe('alignPasses with a short pass and a sure hint', () => {
  it('matches 4 s of song when told to search only a few hundred ms', () => {
    const reference = passOf(SONG, 0, 60 * 60)
    const pass = passOf(SONG, 600, 840, { clockMs: 36000, noise: 0.1, seed: 9 })
    expect(alignPasses(reference, pass, { hint: { offsetMs: -26000, withinMs: 300 } })).toBeNull()
    const found = alignPasses(reference, pass, { hint: { offsetMs: -26000 + 120, withinMs: 300 }, minOverlapMs: 3000 })!
    expect(Math.abs(found.offsetMs - (600 * FRAME_MS - 36000))).toBeLessThan(5)
  })
})
