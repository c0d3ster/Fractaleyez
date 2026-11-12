import { describe, expect, it } from 'vitest'
import { SPECTRUM_BANDS, TickExtrasAccumulator, spectrumEdgesHz } from '../../src/risers/tick-extras'
import { SpectrumReducer } from '../../src/risers/spectrum-reducer'

describe('TickExtrasAccumulator', () => {
  it('keeps each band\'s peak power, the onsets that fired and the mean spectrum, then starts over', () => {
    const acc = new TickExtrasAccumulator()
    const flat = (v: number): number[] => Array.from({ length: SPECTRUM_BANDS }, () => v)
    acc.add({ levels: [1, 2, 0, 0, 0], onsets: [true, false, false, false, false], spectrum: flat(10) })
    acc.add({ levels: [3, 1, 0, 0, 2], onsets: [false, false, false, false, true], spectrum: flat(20) })
    const extras = acc.flush()
    expect(extras.peak).toEqual([9, 4, 0, 0, 4])
    expect(extras.onsets).toBe(1 + 16)
    expect(extras.spectrum).toEqual(flat(15))
    expect(acc.flush()).toEqual({ peak: [0, 0, 0, 0, 0], onsets: 0, spectrum: null })
  })
})

describe('SpectrumReducer', () => {
  it('pools 256 analyser bins at 48 kHz into SPECTRUM_BANDS bands, low bands repeating the nearest bin', () => {
    expect(spectrumEdgesHz()).toHaveLength(SPECTRUM_BANDS + 1)
    const reducer = new SpectrumReducer(48000, 256)
    const bins = Array.from({ length: 256 }, (_, i) => i)
    const bands = Array.from(reducer.reduce(bins))
    expect(bands).toHaveLength(SPECTRUM_BANDS)
    // Rising bins in give rising (never falling) bands out.
    bands.forEach((value, i) => {
      if (i > 0) expect(value).toBeGreaterThanOrEqual(bands[i - 1]!)
    })
    // 16 kHz is bin 170.7 at 93.75 Hz a bin, so the top band ends there.
    expect(bands[SPECTRUM_BANDS - 1]).toBeLessThanOrEqual(171)
    expect(bands[0]).toBeGreaterThanOrEqual(0)
  })
})
