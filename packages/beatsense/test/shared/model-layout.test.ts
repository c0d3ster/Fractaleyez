import { describe, expect, it } from 'vitest'

import { checkDrumModel, DRUM_HIT_MODEL, DrumHits, type DrumHitModel } from '../../src/drums'
import { checkRhythmModel, readRhythm, RHYTHM_MODEL, RhythmLabeler, type RhythmModel } from '../../src/rhythm'
import { riserProbability, sweepProbability } from '../../src'

const SILENT = { bandOnsets: [[], [], [], [], []], periodMs: 500 }

describe('injected drum models', () => {
  it('accepts the bundled model and a copy of it', () => {
    expect(() => checkDrumModel(DRUM_HIT_MODEL)).not.toThrow()
    expect(() => new DrumHits(undefined, structuredClone(DRUM_HIT_MODEL))).not.toThrow()
  })

  it('rejects a model whose features are reordered, missing or sized wrong', () => {
    const swapped: DrumHitModel = { ...DRUM_HIT_MODEL, features: [...DRUM_HIT_MODEL.features].reverse() }
    const short: DrumHitModel = { ...DRUM_HIT_MODEL, features: DRUM_HIT_MODEL.features.slice(1) }
    const badMean: DrumHitModel = { ...DRUM_HIT_MODEL, mean: DRUM_HIT_MODEL.mean.slice(1) }
    const badHidden: DrumHitModel = { ...DRUM_HIT_MODEL, hidden: { ...DRUM_HIT_MODEL.hidden, weights: DRUM_HIT_MODEL.hidden.weights.map((row) => row.slice(1)) } }
    const badThresholds: DrumHitModel = { ...DRUM_HIT_MODEL, thresholds: [0.5] }
    for (const model of [swapped, short, badMean, badHidden, badThresholds]) expect(() => new DrumHits(undefined, model)).toThrow(/Drum hit model/)
  })
})

describe('injected rhythm models', () => {
  it('accepts the bundled model and a copy of it', () => {
    expect(() => checkRhythmModel(RHYTHM_MODEL)).not.toThrow()
    expect(readRhythm(SILENT, {}, structuredClone(RHYTHM_MODEL)).pattern).toBeNull()
  })

  it('rejects a model whose features are reordered or sized wrong, in readRhythm and the labeler', () => {
    const swapped: RhythmModel = { ...RHYTHM_MODEL, features: [...RHYTHM_MODEL.features].reverse() }
    const badScale: RhythmModel = { ...RHYTHM_MODEL, scale: RHYTHM_MODEL.scale.slice(1) }
    const badCoef: RhythmModel = { ...RHYTHM_MODEL, coef: RHYTHM_MODEL.coef.map((row) => row.slice(1)) }
    const badIntercept: RhythmModel = { ...RHYTHM_MODEL, intercept: [0] }
    for (const model of [swapped, badScale, badCoef, badIntercept]) {
      expect(() => readRhythm(SILENT, {}, model)).toThrow(/Rhythm model/)
      expect(() => new RhythmLabeler({}, {}, model)).toThrow(/Rhythm model/)
    }
  })
})

describe('the package entry', () => {
  it('exports the riser and sweep scoring functions', () => {
    expect(typeof riserProbability).toBe('function')
    expect(typeof sweepProbability).toBe('function')
  })
})
