import { describe, expect, it } from 'vitest'
import { TICK_BYTES, base64ToBytes, bytesToBase64, decodeTicks, encodeTicks } from './tick-encoding'
import { SPECTRUM_BANDS } from './tick-extras'
import type { SectionTick } from './sections'

const spectrum = Array.from({ length: SPECTRUM_BANDS }, (_, i) => (i * 7) % 256)

describe('tick encoding', () => {
  it('round-trips ticks with and without extras, through base64', () => {
    const ticks: SectionTick[] = [
      { t: 123456.789, power: [1.5, 2, 3, 4, 5], beats: 1, bpm: 128 },
      { t: 123506.789, power: [0.25, 0, 0, 0, 1], beats: 0, bpm: null, peak: [2, 0.5, 0, 0, 1.5], onsets: 17 },
      { t: 123556.789, power: [0, 0, 0, 0, 0], beats: 2, bpm: 64.5, peak: [0, 0, 0, 0, 0], onsets: 0, spectrum },
    ]
    const bytes = encodeTicks(ticks)
    expect(bytes.length).toBe(3 * TICK_BYTES)
    const back = decodeTicks(base64ToBytes(bytesToBase64(bytes)))
    expect(back).toEqual(ticks)
  })

  it('refuses data that is not whole ticks', () => {
    expect(() => decodeTicks(new Uint8Array(TICK_BYTES + 1))).toThrow()
  })
})
