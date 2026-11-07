import { describe, expect, it } from 'vitest'

import { LEVEL_FEATURE_NAMES, levelFeatures, LevelFrame } from './rhythm-levels'

const BEAT = 60000 / 140
const FRAME_MS = 1000 / 60

// Five seconds of frames at 60 fps with the bass band's level from `bass(t)` (the other bands quiet).
const frames = (bass: (t: number) => number): LevelFrame[] =>
  Array.from({ length: 300 }, (_, i) => {
    const t = i * FRAME_MS
    return { t, bands: [{ level: bass(t) }, { level: 0.01 }, { level: 0.01 }] }
  })
const feature = (values: number[], name: string): number => values[LEVEL_FEATURE_NAMES.indexOf(name)] ?? NaN
const NOW = 299 * FRAME_MS

describe('levelFeatures', () => {
  it('reads a held wobble bass as sustained, and a kick as short spikes', () => {
    const wobble = levelFeatures(frames((t) => 20 + 10 * Math.sin((2 * Math.PI * t) / (BEAT / 2))), NOW, BEAT)
    const kick = levelFeatures(frames((t) => (t % BEAT < 60 ? 30 : 0.5)), NOW, BEAT)
    expect(feature(wobble, 's0')).toBeGreaterThan(0.6)
    expect(feature(kick, 's0')).toBeLessThan(0.2)
    expect(feature(kick, 'c0')).toBeGreaterThan(feature(wobble, 'c0'))
  })

  it('finds the wobble rate in the envelope', () => {
    const eighths = levelFeatures(frames((t) => 20 + 10 * Math.sin((2 * Math.PI * t) / (BEAT / 2))), NOW, BEAT)
    expect(feature(eighths, 'a0_0.5')).toBeGreaterThan(0.8)
    expect(feature(eighths, 'a0_0.25')).toBeLessThan(0)
  })

  it('is all zeros without a tempo or with too little history', () => {
    expect(levelFeatures(frames(() => 10), NOW, null).every((x) => x === 0)).toBe(true)
    expect(levelFeatures(frames(() => 10).slice(-30), NOW, BEAT).every((x) => x === 0)).toBe(true)
  })
})
