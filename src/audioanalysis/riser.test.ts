import { describe, expect, it } from 'vitest'

import { RiserDetector, riserFeatures, riserProbability, type RiserSlot } from './riser'
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
  // The model trained with real breakdowns and drops as negatives stays under 0.5 through this riser.
  it.fails('rises through a riser and stays low without one', () => {
    const detector = new RiserDetector()
    const { riser, plain } = fixture.clips
    riser.frames.forEach((levels, f) => {
      detector.push(f * 50, levels)
      if (f * 50 === Math.round(riser.riserTo * 1000 / 50) * 50) expect(detector.getScore()).toBeGreaterThan(0.5)
    })
    expect(run(plain).every(({ t, probability }) => t < 1000 || probability < 0.5)).toBe(true)
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
