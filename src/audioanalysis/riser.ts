import modelData from './riser-model.json'

// How much the music sounds like it is rising right now (a noise sweep, a pitch riser, a high-passed whoosh): 0 to 1, for the Frequency HUD
// and, read offline, for the section model. A riser is not a hit but a climb over bars, so instead of onsets this follows the five band levels
// in 100 ms slots and reads their trend over the last 2, 4 and 8 seconds: how fast each band is rising, whether the power is moving up the
// spectrum and the highs are gaining on the lows, how steady that climb is, and whether the highs are at their peak. A small model
// (riser-model.json: one hidden layer of tanh units and a sigmoid, trained on synthetic risers over drums and melodic beds against fade-ins,
// steady noise and downlifters: scripts/section-eval/drum-gen.py, drum-eval.mts, riser-train.py) turns that into a score, which is smoothed.
const BAND_COUNT = 5
const SLOT_MS = 100
// 8 s of slots.
const HISTORY_SLOTS = 80
// The trend windows, in slots.
const WINDOWS = [20, 40, 80] as const
// Fewest slots a trend is read from; before that the features are zero.
const MIN_SLOTS = 10
const POWER_EPS = 1e-6
// The shown score follows the model's this fast (ms), so a slot or two of doubt does not flicker it.
const SMOOTH_MS = 400

/** A dense layer: `weights[out][in]`. */
type Layer = { weights: number[][]; bias: number[] }
type RiserModel = { features: string[]; mean: number[]; scale: number[]; hidden: Layer; output: Layer }
const MODEL: RiserModel = modelData

/** Every slot, as the model saw it: for replaying clips and songs offline and retraining (drum-eval.mts). */
export type RiserSlot = { t: number; features: number[]; probability: number }

const toDb = (power: number): number => 10 * Math.log10(power + POWER_EPS)

// Least-squares slope (per slot) and R squared of `values` against their index.
const fit = (values: readonly number[]): { slope: number; r2: number } => {
  const n = values.length
  if (n < 2) return { slope: 0, r2: 0 }
  const meanX = (n - 1) / 2
  const meanY = values.reduce((sum, v) => sum + v, 0) / n
  let sxy = 0
  let sxx = 0
  let syy = 0
  values.forEach((v, i) => {
    sxy += (i - meanX) * (v - meanY)
    sxx += (i - meanX) ** 2
    syy += (v - meanY) ** 2
  })
  const slope = sxx > 0 ? sxy / sxx : 0
  return { slope, r2: sxx > 0 && syy > 0 ? (sxy * sxy) / (sxx * syy) : 0 }
}

// Where the power sits across the bands, 0 (all bass) to 4 (all air), from one slot's levels in dB.
const centroidOf = (dbs: readonly number[]): number => {
  const powers = dbs.map((d) => 10 ** (d / 10))
  const total = powers.reduce((sum, p) => sum + p, 0)
  return total > 0 ? powers.reduce((sum, p, b) => sum + p * b, 0) / total : 0
}

const highs = (dbs: readonly number[]): number => ((dbs[3] ?? 0) + (dbs[4] ?? 0)) / 2
const tiltOf = (dbs: readonly number[]): number => highs(dbs) - ((dbs[0] ?? 0) + (dbs[1] ?? 0)) / 2

/**
 * The model's inputs, in riser-model.json's order, from the slots' levels in dB, oldest first: per window (2, 4 and 8 s) each band's slope
 * (dB a second), the centroid's slope, the tilt's slope (highs against lows) and how well a line fits the highs (R squared); then the hi
 * band, the air band and the whole mix against their highest slot in the 8 s, and the centroid now.
 */
export const riserFeatures = (slots: ReadonlyArray<readonly number[]>): number[] => {
  const perSecond = 1000 / SLOT_MS
  const trends = WINDOWS.flatMap((size) => {
    const recent = slots.slice(-size)
    if (recent.length < MIN_SLOTS) return new Array<number>(BAND_COUNT + 3).fill(0)
    const bandSlopes = Array.from({ length: BAND_COUNT }, (_, b) => fit(recent.map((dbs) => dbs[b] ?? 0)).slope * perSecond)
    return [
      ...bandSlopes,
      fit(recent.map(centroidOf)).slope * perSecond,
      fit(recent.map(tiltOf)).slope * perSecond,
      fit(recent.map(highs)).r2,
    ]
  })
  const now = slots[slots.length - 1]
  if (!now || slots.length < MIN_SLOTS) return [...trends, 0, 0, 0, 0]
  const total = (dbs: readonly number[]): number => toDb(dbs.reduce((sum, d) => sum + 10 ** (d / 10), 0))
  const peak = (value: (dbs: readonly number[]) => number): number => Math.max(...slots.map(value))
  const hi = (dbs: readonly number[]): number => dbs[3] ?? 0
  const air = (dbs: readonly number[]): number => dbs[4] ?? 0
  return [...trends, hi(now) - peak(hi), air(now) - peak(air), total(now) - peak(total), centroidOf(now)]
}

const dense = ({ weights, bias }: Layer, input: readonly number[]): number[] =>
  weights.map((row, j) => row.reduce((sum, w, i) => sum + w * (input[i] ?? 0), bias[j] ?? 0))

/** The model's probability that the slot is inside a riser. */
export const riserProbability = (features: readonly number[]): number => {
  const scaled = features.map((v, i) => (v - (MODEL.mean[i] ?? 0)) / (MODEL.scale[i] ?? 1))
  const score = dense(MODEL.output, dense(MODEL.hidden, scaled).map(Math.tanh))[0] ?? 0
  return 1 / (1 + Math.exp(-score))
}

/** Runs every frame beside the beat detector, on the raw band levels. */
export class RiserDetector {
  private readonly sums = new Float64Array(BAND_COUNT)
  private frames = 0
  private slotStart: number | null = null
  private readonly slots: number[][] = []
  private score = 0
  private lastT: number | null = null

  constructor(private readonly onSlot?: (slot: RiserSlot) => void) {}

  push = (t: number, levels: readonly number[]): void => {
    if (this.slotStart === null) this.slotStart = t
    for (let b = 0; b < BAND_COUNT; b++) this.sums[b]! += (levels[b] ?? 0) ** 2
    this.frames++
    if (t - this.slotStart >= SLOT_MS - 0.5) this.closeSlot(t)
  }

  /** The smoothed score, 0 to 1. */
  getScore = (): number => this.score

  reset = (): void => {
    this.sums.fill(0)
    this.frames = 0
    this.slotStart = null
    this.slots.length = 0
    this.score = 0
    this.lastT = null
  }

  private closeSlot = (t: number): void => {
    this.slots.push(Array.from(this.sums, (sum) => toDb(sum / Math.max(1, this.frames))))
    if (this.slots.length > HISTORY_SLOTS) this.slots.shift()
    this.sums.fill(0)
    this.frames = 0
    this.slotStart = t
    const features = riserFeatures(this.slots)
    const probability = this.slots.length >= MIN_SLOTS ? riserProbability(features) : 0
    const dt = this.lastT === null ? SLOT_MS : t - this.lastT
    this.lastT = t
    this.score += (probability - this.score) * (1 - Math.exp(-dt / SMOOTH_MS))
    this.onSlot?.({ t, features, probability })
  }
}

export const riserDetector = new RiserDetector()
