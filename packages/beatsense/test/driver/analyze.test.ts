import { describe, expect, it } from 'vitest'

import { analyze } from '../../src'
import { parityPcm } from '../frontend/parity-signal'

const RATE = 44100

/** A 120 bpm four on the floor: a kick every 500 ms, a hat between them, for `seconds`. */
const fourOnTheFloor = (seconds: number): Float64Array => {
  const out = new Float64Array(seconds * RATE)
  for (let n = 0; n < out.length; n++) {
    const t = n / RATE
    const sinceKick = t % 0.5
    const sinceHat = (t + 0.25) % 0.5
    out[n] = 0.6 * Math.sin(2 * Math.PI * 60 * sinceKick) * Math.exp(-25 * sinceKick) + 0.15 * Math.sin(2 * Math.PI * 9000 * t) * Math.exp(-120 * sinceHat)
  }
  return out
}

describe('analyze', () => {
  it('reads one frame per 1/60 s of PCM, timed on the audio clock', async () => {
    const { frames } = await analyze({ pcm: parityPcm(RATE), sampleRate: RATE })
    expect(frames).toHaveLength(180)
    expect(frames[60]!.t).toBeCloseTo(1000, 6)
  })

  it('finds the kicks of a steady beat in PCM', async () => {
    const { frames } = await analyze({ pcm: fourOnTheFloor(20), sampleRate: RATE })
    const beats = frames.filter(({ beat }) => beat).map(({ t }) => t)
    expect(beats.length).toBeGreaterThan(25)
    const gaps = beats.slice(1).map((t, i) => t - beats[i]!)
    // The hat between the kicks leaks into the hi band, so the gaps are a half or a whole beat; nothing lands off the 250 ms grid.
    expect(gaps.every((gap) => Math.abs(gap - 250) < 40 || Math.abs(gap - 500) < 40)).toBe(true)
  })

  it('takes levels instead of PCM and gives the same readings as PCM through the front end', async () => {
    const pcm = fourOnTheFloor(10)
    const fromPcm = await analyze({ pcm, sampleRate: RATE })
    const fromLevels = await analyze({ levels: fromPcm.frames.map(({ levels }) => levels) })
    expect(fromLevels.frames.map(({ beat }) => beat)).toEqual(fromPcm.frames.map(({ beat }) => beat))
  })

  it('accepts a different frame rate', async () => {
    const { frames } = await analyze({ pcm: parityPcm(RATE), sampleRate: RATE }, { fps: 30 })
    expect(frames).toHaveLength(90)
    expect(frames[1]!.t).toBeCloseTo(1000 / 30, 6)
  })
})
