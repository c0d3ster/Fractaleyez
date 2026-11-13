import { describe, expect, it } from 'vitest'

import type { BeatSample } from 'beatsense'
import { BASS_CREDIT_MS, HIT_FLASH_MS, beatFlashes } from '../src/beatFlashes'

const BANDS = 5
const band = (rising = false): BeatSample['bands'][number] => ({ level: 0, loudness: 1, trigger: 0, rising })
const sample = (t: number, beatBand: number | null, bassRising = false): BeatSample => ({
  t,
  beatBand,
  bands: Array.from({ length: BANDS }, (_, i) => band(i === 0 && bassRising)),
})

describe('beatFlashes', () => {
  it('flashes the band that set off the beat, fading over the flash time', () => {
    const flashes = beatFlashes([sample(1000, 3)], 1000 + HIT_FLASH_MS / 2, BANDS)
    expect(flashes[3]).toBeCloseTo(0.5)
    expect(flashes[0]).toBe(0)
  })

  it('credits bass when its own onset comes just after a beat hi set off', () => {
    const flashes = beatFlashes([sample(1000, 3), sample(1033, null, true)], 1050, BANDS)
    expect(flashes[0]).toBeGreaterThan(0)
    expect(flashes[0]).toBe(flashes[3])
  })

  it('credits bass when its onset comes just before', () => {
    expect(beatFlashes([sample(1000, null, true), sample(1040, 3)], 1050, BANDS)[0]).toBeGreaterThan(0)
  })

  it('does not credit a bass onset further off than the credit window', () => {
    expect(beatFlashes([sample(1000, 3), sample(1000 + BASS_CREDIT_MS + 20, null, true)], 1100, BANDS)[0]).toBe(0)
  })

  it('does not flash bass for a bass onset with no beat near it', () => {
    expect(beatFlashes([sample(1000, null, true)], 1010, BANDS)[0]).toBe(0)
  })

  it('flashes the band a beat was handed to (rebandTo)', () => {
    const flashes = beatFlashes([sample(1000, 3), { ...sample(1030, null), rebandTo: 2 }], 1050, BANDS)
    expect(flashes[2]).toBeGreaterThan(0)
    expect(flashes[3]).toBeGreaterThan(0)
  })

  it('is dark once the flash time has passed', () => {
    expect(beatFlashes([sample(1000, 3), sample(1020, null, true)], 1000 + HIT_FLASH_MS + 1, BANDS)).toEqual([0, 0, 0, 0, 0])
  })
})
