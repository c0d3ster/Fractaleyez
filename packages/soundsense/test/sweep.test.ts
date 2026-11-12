import { describe, expect, it } from 'vitest'

import { SWEEP_FEATURE_NAMES, SweepDetector, sweepFeatures, sweepProbability, type SweepSlot } from '../src/sweep'
import fixture from './sweep.fixture.json'

const named = (features: number[], name: string): number => features[SWEEP_FEATURE_NAMES.indexOf(name)] ?? Number.NaN

// 50 ms ticks of a flat bed with a ridge at band `at(i)` and a hat-like burst in the top bands every fifth tick.
const ticksOf = (count: number, at: (i: number) => number): number[][] =>
  Array.from({ length: count }, (_, i) => Array.from({ length: 40 }, (__, b) => 100 + 60 * Math.exp(-((b - at(i)) ** 2) / 2) + (i % 5 === 0 && b > 30 ? 30 : 0)))

const run = (ticks: number[][]): SweepSlot[] => {
  const slots: SweepSlot[] = []
  const detector = new SweepDetector((slot) => slots.push(slot))
  ticks.forEach((tick, i) => detector.pushTick((i + 1) * 50, tick))
  return slots
}

describe('sweepFeatures', () => {
  it('reads a ridge climbing a band every half second as a straight line up and the pattern shifting up', () => {
    const last = run(ticksOf(200, (i) => 16 + i / 10)).at(-1)!.features
    expect(named(last, '8s_ridge_slope')).toBeCloseTo(2, 1)
    expect(named(last, '8s_ridge_r2')).toBeGreaterThan(0.99)
    expect(named(last, '8s_shift_up')).toBeGreaterThan(1)
  })

  it('reads the same ridge falling as the opposite, and a steady one as no motion', () => {
    const down = run(ticksOf(200, (i) => 36 - i / 10)).at(-1)!.features
    expect(named(down, '8s_ridge_slope')).toBeCloseTo(-2, 1)
    expect(named(down, '8s_shift_up')).toBeLessThan(-1)
    const steady = run(ticksOf(200, () => 26)).at(-1)!.features
    expect(Math.abs(named(steady, '8s_shift_up'))).toBeLessThan(0.05)
    expect(Math.abs(named(steady, '8s_region2_slope'))).toBeLessThan(0.5)
  })

  it('reads nothing before two seconds of half-second steps', () => {
    expect(sweepFeatures([[1], [2], [3]]).every((v) => v === 0)).toBe(true)
  })
})

describe('sweepProbability', () => {
  // Feature vectors from the training set and what the Python fit gave for them: the same model, read the same way.
  it('matches the trained model', () => {
    fixture.parity.features.forEach((features, i) => expect(sweepProbability(features)).toBeCloseTo(fixture.parity.p[i]!, 3))
  })
})

describe('SweepDetector', () => {
  it('rises through a ridge climbing the spectrum and stays low when it falls or holds still', () => {
    const scoreOf = (at: (i: number) => number): number => {
      const detector = new SweepDetector()
      ticksOf(200, at).forEach((tick, i) => detector.pushTick((i + 1) * 50, tick))
      return detector.getScore()
    }
    expect(scoreOf((i) => 16 + i / 10)).toBeGreaterThan(0.5)
    expect(scoreOf((i) => 36 - i / 10)).toBeLessThan(0.2)
    expect(scoreOf(() => 26)).toBeLessThan(0.2)
  })

  it('reads a sweep after a gap as if it came out of silence, not against the louder sound before the gap', () => {
    const flat = (count: number, value: number): number[][] => Array.from({ length: count }, () => new Array<number>(40).fill(value))
    const sweep = ticksOf(60, (i) => 16 + i / 10)
    const afterLoud = run([...flat(120, 230), ...flat(30, 20), ...sweep]).at(-1)!.features
    const afterSilence = run([...flat(120, 20), ...flat(30, 20), ...sweep]).at(-1)!.features
    afterSilence.forEach((v, i) => expect(afterLoud[i]).toBeCloseTo(v, 6))
  })

  it('keeps the history through a dip that is not a gap', () => {
    // 16 dB down (55 byte steps), and the sweep under it about 20 dB down: still music.
    const flat = (count: number, value: number): number[][] => Array.from({ length: count }, () => new Array<number>(40).fill(value))
    const sweep = ticksOf(60, (i) => 16 + i / 10)
    const afterLoud = run([...flat(120, 175), ...flat(30, 120), ...sweep]).at(-1)!.features
    const afterQuiet = run([...flat(120, 120), ...flat(30, 120), ...sweep]).at(-1)!.features
    expect(named(afterLoud, 'region3_vs_peak')).toBeLessThan(named(afterQuiet, 'region3_vs_peak') - 1)
  })

  it('pools frames into 50 ms ticks the way the recorder does, and starts from nothing after a reset', () => {
    const fromFrames: SweepSlot[] = []
    const frames = new SweepDetector((slot) => fromFrames.push(slot))
    // Three frames a tick, 50/3 ms apart; the tick closes on the frame at or after 50 ms.
    const ticks = ticksOf(120, (i) => 16 + i / 10)
    ticks.forEach((tick, i) => [0, 1, 2].forEach((k) => frames.push(i * 50 + (k * 50) / 3, tick)))
    expect(fromFrames.length).toBeGreaterThan(50)
    frames.reset()
    expect(frames.getScore()).toBe(0)
  })
})
