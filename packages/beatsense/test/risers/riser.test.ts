import { describe, expect, it } from 'vitest'

import { RISER_FEATURE_NAMES, RiserDetector, nextSlotStart, riserFeatures, riserProbability, type RiserSlot } from '../../src/risers/riser'
import fixture from './riser.fixture.json'

// Slots of band levels in dB (bass, lo, mid, hi, air), one every 100 ms.
const slotsOf = (count: number, level: (slot: number) => number[]): number[][] => Array.from({ length: count }, (_, i) => level(i))
const BED = [20, 18, 12, 6, 0]
// The features' layout (riser-model.json): per window (2, 4, 8 s) five band slopes, the centroid's slope, the tilt's slope, the highs' R²;
// then hi, air and the mix against their peak, and the centroid now.
const PER_WINDOW = 8
const at = (window: number, item: number): number => window * PER_WINDOW + item

describe('riserFeatures', () => {
  it('reads a steady climb in the highs as rising slopes, a centroid moving up and a straight line', () => {
    // hi and air climb 3 dB a second (0.3 a slot) for 8 s.
    const features = riserFeatures(slotsOf(80, (i) => BED.map((v, b) => (b >= 3 ? v + 0.3 * i : v))))
    ;[0, 1, 2].forEach((w) => {
      expect(features[at(w, 3)]).toBeCloseTo(3, 5)
      expect(features[at(w, 4)]).toBeCloseTo(3, 5)
      expect(features[at(w, 0)]).toBeCloseTo(0, 5)
      expect(features[at(w, 5)]).toBeGreaterThan(0)
      expect(features[at(w, 6)]).toBeCloseTo(3, 5)
      expect(features[at(w, 7)]).toBeCloseTo(1, 5)
    })
    // At its peak now.
    expect(features[24]).toBeCloseTo(0, 5)
    expect(features[25]).toBeCloseTo(0, 5)
  })

  it('reads steady levels as no trend', () => {
    const features = riserFeatures(slotsOf(80, () => BED))
    ;[0, 1, 2].forEach((w) => [0, 1, 2, 3, 4, 5, 6].forEach((item) => expect(features[at(w, item)]).toBeCloseTo(0, 6)))
  })

  // By name, for the inputs after the first model's 28.
  const named = (features: number[], name: string): number => features[RISER_FEATURE_NAMES.indexOf(name)] ?? Number.NaN

  it('reads the climb in the highs the same when the lows drop out under it', () => {
    const climb = (i: number): number[] => BED.map((v, b) => (b >= 3 ? v + 0.3 * i : v))
    // The kick and bass gone for the last 3 s: the step-proof slope and the share of rising steps do not move.
    const cut = (i: number): number[] => climb(i).map((v, b) => (b <= 1 && i >= 50 ? v - 20 : v))
    const [steady, dropped] = [riserFeatures(slotsOf(80, climb)), riserFeatures(slotsOf(80, cut))]
    ;['2s_robust_slope_highs', '4s_robust_slope_highs', '8s_robust_slope_highs', '8s_rise_share_highs', 'hi_vs_min', 'air_vs_min'].forEach((name) =>
      expect(named(dropped, name)).toBeCloseTo(named(steady, name), 6))
    expect(named(steady, '8s_robust_slope_highs')).toBeCloseTo(3, 5)
    expect(named(steady, '8s_rise_share_highs')).toBe(1)
    // The centroid (against the lows) does move.
    expect(named(dropped, 'centroid')).toBeGreaterThan(named(steady, 'centroid'))
  })

  it('counts how long the bass has been gone over the last 32 s', () => {
    // 20 s of the full bed, then 12 s with the bass 20 dB down.
    const features = riserFeatures(slotsOf(320, (i) => BED.map((v, b) => (b === 0 && i >= 200 ? v - 20 : v))))
    expect(named(features, 'bass_gone_s')).toBe(12)
    expect(named(features, 'bass_vs_peak_32s')).toBeCloseTo(-20, 6)
    expect(named(features, '16s_slope_highs')).toBeCloseTo(0, 6)
    // The first 8 s inputs read only the last 80 slots: all after the cut, so no trend.
    expect(named(features, '8s_slope_bass')).toBeCloseTo(0, 6)
  })

  it('reads nothing before a second of slots', () => {
    expect(riserFeatures(slotsOf(9, () => BED)).every((v) => v === 0)).toBe(true)
  })
})

describe('riserProbability', () => {
  // Feature vectors from the training set and what the Python fit gave for them: the same model, read the same way.
  it('matches the trained model', () => {
    fixture.parity.features.forEach((features, i) => expect(riserProbability(features)).toBeCloseTo(fixture.parity.p[i]!, 3))
  })
})

// Band levels at 20 fps (each frame the mean power of three at 60 fps; the detector only reads 100 ms means) of two generated test clips
// (scripts/section-eval/drum-gen.py): a riser over drums, and the same kind of clip with none.
type Clip = { riserFrom: number; riserTo: number; frames: number[][] }
const run = (clip: Clip): RiserSlot[] => {
  const slots: RiserSlot[] = []
  const detector = new RiserDetector((slot) => slots.push(slot))
  clip.frames.forEach((levels, f) => detector.push(f * 50, levels))
  return slots
}

describe('RiserDetector', () => {
  // Known gap, failing on purpose until the model is retrained (scripts/section-eval/DRUM-HITS.md): when it passes, make it a plain `it` again.
  // The pure riser model (highs-only inputs, synthetic breakdowns and real drops and breakdowns as negatives) rises through this riser
  // (0.995 at its end), but single slots of the plain clip still read over 0.5 (0.95 at most) before smoothing.
  it.fails('rises through a riser and stays low without one', () => {
    const detector = new RiserDetector()
    const { riser, plain } = fixture.clips
    riser.frames.forEach((levels, f) => {
      detector.push(f * 50, levels)
      if (f * 50 === Math.round(riser.riserTo * 1000 / 50) * 50) expect(detector.getScore()).toBeGreaterThan(0.5)
    })
    expect(run(plain).every(({ t, probability }) => t < 1000 || probability < 0.5)).toBe(true)
  })

  // Band levels (percent, as audio-feed.ts pushes them) every 50 ms: `count` frames of `level(frame)`.
  const framesOf = (count: number, level: (frame: number) => number[]): number[][] => Array.from({ length: count }, (_, f) => level(f))
  const climb = framesOf(80, (f) => [0.1, 0.1, 0.5 + f / 40, 0.5 + f / 20, 0.5 + f / 20])
  const lastFeatures = (frames: number[][]): number[] => {
    const slots = run({ riserFrom: 0, riserTo: 0, frames })
    return slots[slots.length - 1]!.features
  }

  it('reads a riser after a gap as if it came out of silence, not against the louder sound before the gap', () => {
    const gap = framesOf(30, () => [0.1, 0.1, 0.1, 0.1, 0.1])
    const loud = framesOf(120, () => [30, 30, 30, 30, 30])
    const afterLoud = lastFeatures([...loud, ...gap, ...climb])
    const afterSilence = lastFeatures([...framesOf(120, () => [0.1, 0.1, 0.1, 0.1, 0.1]), ...gap, ...climb])
    afterSilence.forEach((v, i) => expect(afterLoud[i]).toBeCloseTo(v, 6))
  })

  it('keeps the history through a dip that is not a gap', () => {
    // 12 dB down: still music, so a climb from there is still read against what came before.
    const dip = framesOf(30, () => [7.5, 7.5, 7.5, 7.5, 7.5])
    const climbFromDip = framesOf(80, (f) => [7.5, 7.5, 7.5 + f / 20, 7.5 + f / 10, 7.5 + f / 10])
    const afterLoud = lastFeatures([...framesOf(120, () => [30, 30, 30, 30, 30]), ...dip, ...climbFromDip])
    const afterQuiet = lastFeatures([...framesOf(120, () => [7.5, 7.5, 7.5, 7.5, 7.5]), ...dip, ...climbFromDip])
    const hiVsPeak = RISER_FEATURE_NAMES.indexOf('hi_vs_peak')
    expect(afterLoud[hiVsPeak]).toBeLessThan((afterQuiet[hiVsPeak] ?? 0) - 1)
  })

  it('makes a slot every 100 ms, and starts from nothing after a reset', () => {
    const slots = run(fixture.clips.plain)
    expect(slots.length).toBe(Math.floor((fixture.clips.plain.frames.length - 1) / 2))
    const detector = new RiserDetector()
    fixture.clips.riser.frames.forEach((levels, f) => detector.push(f * 50, levels))
    detector.reset()
    expect(detector.getScore()).toBe(0)
  })
})

describe('nextSlotStart', () => {
  it('keeps slots at their length on average when frames do not divide it', () => {
    // 50 ms ticks at 30 fps: a tick closes on the first frame at or past its end.
    const frameMs = 1000 / 30
    let start = 0
    let closed = 0
    for (let frame = 1; frame <= 300; frame++) {
      const t = frame * frameMs
      if (t - start < 50 - 0.5) continue
      start = nextSlotStart(start, t, 50)
      closed++
    }
    expect(closed).toBe(200)
  })

  it('starts over at the frame after a stall instead of catching up', () => {
    expect(nextSlotStart(0, 400, 100)).toBe(400)
    expect(nextSlotStart(0, 120, 100)).toBe(100)
  })
})
