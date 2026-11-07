import { describe, expect, it } from 'vitest'
import { TempoChangeCue } from './tempo-change'

const feed = (cue: TempoChangeCue, readings: Array<[number, number | null, boolean]>): boolean[] =>
  readings.map(([t, bpm, armed]) => cue.push(t, bpm, armed))

const steady = (from: number, to: number, bpm: number | null, armed = true): Array<[number, number | null, boolean]> =>
  Array.from({ length: Math.round((to - from) / 250) }, (_, i) => [from + i * 250, bpm, armed])

describe('TempoChangeCue', () => {
  it('fires once a different tempo has held for the hold time', () => {
    const cue = new TempoChangeCue({ minChange: 0.05, harmonicTolerance: 0.03, holdMs: 3000, follow: 0.05 })
    feed(cue, steady(0, 10000, 128))
    const fired = feed(cue, steady(10000, 20000, 140))
    expect(fired.indexOf(true) * 250).toBe(3000)
  })

  it('takes whatever is shown as the song tempo while not armed', () => {
    const cue = new TempoChangeCue()
    feed(cue, steady(0, 10000, 128, false))
    feed(cue, steady(10000, 20000, 140, false))
    expect(feed(cue, steady(20000, 40000, 140)).some(Boolean)).toBe(false)
    expect(cue.getSongBpm()).toBe(140)
  })

  it('ignores octaves, 3:2, 2:3, 4:3, 3:4, small drifts and gaps with no tempo', () => {
    for (const bpm of [64, 256, 192, 85.3, 170.7, 96, 131]) {
      const cue = new TempoChangeCue()
      feed(cue, steady(0, 10000, 128))
      expect(feed(cue, steady(10000, 30000, bpm)).some(Boolean)).toBe(false)
    }
    const gap = new TempoChangeCue()
    feed(gap, steady(0, 10000, 128))
    expect(feed(gap, steady(10000, 40000, null)).some(Boolean)).toBe(false)
  })

  it('follows a slow drift, so a long ramp does not read as a new song', () => {
    const cue = new TempoChangeCue()
    const ramp: Array<[number, number, boolean]> = Array.from({ length: 2400 }, (_, i) => [i * 250, 124 + (i / 2400) * 12, true])
    expect(feed(cue, ramp).some(Boolean)).toBe(false)
  })

  it('starts the hold over when the different tempo breaks off', () => {
    const cue = new TempoChangeCue({ minChange: 0.05, harmonicTolerance: 0.03, holdMs: 3000, follow: 0.05 })
    feed(cue, steady(0, 10000, 128))
    const fired = feed(cue, [...steady(10000, 12000, 140), ...steady(12000, 12500, 128), ...steady(12500, 15000, 140)])
    expect(fired.some(Boolean)).toBe(false)
  })
})
