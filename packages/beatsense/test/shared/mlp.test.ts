import { describe, expect, it } from 'vitest'

import { DrumHits, DRUM_HIT_MODEL, drumProbabilities } from '../../src/drums/drum-hits'
import { RHYTHM_MODEL, readRhythm } from '../../src/rhythm/rhythm-pattern'
import { RISER_MODEL, RiserDetector, riserProbability } from '../../src/risers/riser'
import { SWEEP_MODEL, SweepDetector, sweepProbability } from '../../src/risers/sweep'
import { fit, forward, inputIndexes, scoreProbability, sigmoid } from '../../src/shared/mlp'

describe('mlp', () => {
  it('runs a tanh hidden layer into the output layer', () => {
    const model = { hidden: { weights: [[1, 0], [0, 2]], bias: [0, 0] }, output: { weights: [[1, 1]], bias: [0.5] } }
    expect(forward(model, [0, 0])).toEqual([0.5])
    expect(forward(model, [1, 1])[0]).toBeCloseTo(Math.tanh(1) + Math.tanh(2) + 0.5, 12)
  })

  it('has a sigmoid and a least-squares fit', () => {
    expect(sigmoid(0)).toBe(0.5)
    const { slope, r2 } = fit([1, 3, 5, 7])
    expect(slope).toBeCloseTo(2, 12)
    expect(r2).toBeCloseTo(1, 12)
  })

  it('rejects a model that reads an unknown feature', () => {
    expect(() => inputIndexes({ features: ['nope'] }, ['a', 'b'], 'test-model.json')).toThrow('unknown feature: nope')
  })
})

describe('model arguments', () => {
  const flat = (model: typeof RISER_MODEL, output: number): typeof RISER_MODEL => ({
    ...model,
    output: { weights: model.output.weights.map((row) => row.map(() => 0)), bias: [output] },
  })

  it('the riser and sweep detectors score with the model they are given', () => {
    const zeros = (n: number): number[] => new Array<number>(n).fill(0)
    expect(riserProbability(zeros(200), flat(RISER_MODEL, 3))).toBeCloseTo(sigmoid(3), 12)
    expect(sweepProbability(zeros(200), flat(SWEEP_MODEL, -3))).toBeCloseTo(sigmoid(-3), 12)
    expect(scoreProbability(flat(RISER_MODEL, 0), [], [])).toBe(0.5)
    const slots: number[] = []
    const detector = new RiserDetector((slot) => slots.push(slot.probability), flat(RISER_MODEL, 3))
    Array.from({ length: 400 }, (_, f) => detector.push(f * 50, [1, 1, 1, 1, 1]))
    expect(slots.some((p) => Math.abs(p - sigmoid(3)) < 1e-9)).toBe(true)
    const sweepSlots: number[] = []
    const sweep = new SweepDetector((slot) => sweepSlots.push(slot.probability), flat(SWEEP_MODEL, -3))
    Array.from({ length: 800 }, (_, f) => sweep.push(f * 50, new Array<number>(40).fill(100)))
    expect(sweepSlots.some((p) => Math.abs(p - sigmoid(-3)) < 1e-9)).toBe(true)
  })

  it('DrumHits classifies with the model it is given', () => {
    const features = new Array<number>(DRUM_HIT_MODEL.mean.length).fill(0.1)
    const never = { ...DRUM_HIT_MODEL, thresholds: DRUM_HIT_MODEL.thresholds.map(() => 2) }
    expect(drumProbabilities(features, never)).toEqual(drumProbabilities(features))
    const candidates: string[][] = []
    const drums = new DrumHits((candidate) => candidates.push(candidate.kinds), never)
    for (let f = 0; f < 600; f++) drums.push(f * 16.7, f % 30 === 0 ? [80, 40, 30, 20, 10] : [1, 1, 1, 1, 1], 16.7, 1)
    expect(candidates.length).toBeGreaterThan(0)
    expect(candidates.every((kinds) => kinds.length === 0)).toBe(true)
  })

  it('readRhythm names with the model it is given', () => {
    const input = { bandOnsets: [[0, 500, 1000, 1500, 2000, 2500, 3000, 3500], [], [], [], []], periodMs: 500 }
    expect(readRhythm(input).likeliest).toBe('four on the floor')
    const other = { ...RHYTHM_MODEL, classes: RHYTHM_MODEL.classes.map(() => 'breakbeat') }
    expect(readRhythm(input, {}, other).likeliest).toBe('breakbeat')
  })
})
