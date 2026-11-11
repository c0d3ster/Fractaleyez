import modelData from './sweep-model.json'
import { SPECTRUM_BANDS, spectrumEdgesHz } from './tick-extras'
import { nextSlotStart } from './riser'

// How much the music sounds like a sweep is playing right now (a noise riser or a pitch riser climbing up the spectrum): 0 to 1, for the
// Frequency HUD's riser meter and, read offline, for the section model. The band levels (riser.ts) cannot see a sweep that stays inside the
// hi band under the hats; the spectrum can. It reads the analyser's spectrum pooled into 40 log-spaced bands every 50 ms (the training
// recorder's ticks, tick-extras.ts), takes half-second means over the last 8 s, removes each band's own level over that time (so the hats
// and the pads' steady shape drop out) and looks for what is left moving up: the ridge of standing-out energy and its line, the whole
// pattern shifted up a band or two from one half second to the next, each region's climb and how many bands rise. A small model
// (sweep-model.json, one hidden layer, scripts/section-eval/sweep-train.py) turns that into a score, smoothed like the riser's.
const TICK_MS = 50
// Half a second of ticks per mean, and 8 s of means.
const TICKS_PER_STEP = 10
const HISTORY_STEPS = 16
// The trend windows, in half-second steps.
const WINDOWS = [4, 8, 16] as const
// Fewest steps a trend is read from; before that the features are zero.
const MIN_STEPS = 4
// A slot (a reading) every two ticks.
const TICKS_PER_SLOT = 2
// The bands a sweep is looked for in: 300 Hz up.
const SWEEP_FROM_HZ = 300
// Regions for the per-region climb, in Hz.
const REGIONS_HZ = [[300, 1000], [1000, 3000], [3000, 8000], [8000, 16000]] as const
const SHIFTS = [1, 2] as const
// The follower's time constants (ms) going up and down, as in riser.ts.
const RISE_MS = 400
const FALL_MS = 150
// A gap: the spectrum's half-second mean this far (dB) under its highest of the last 8 s for this many slots in a row. As in riser.ts, the
// steps before it then read as the gap, so a sweep that starts soon after something louder is not measured against it.
const GAP_DB = 25
const GAP_SLOTS = 5
// Byte values (0 to 255) to dB over the analyser's -100 to -30 dB range.
const DB_PER_BYTE = 70 / 255

type Layer = { weights: number[][]; bias: number[] }
type SweepModel = { features: string[]; mean: number[]; scale: number[]; hidden: Layer; output: Layer }
const MODEL: SweepModel = modelData

const EDGES = spectrumEdgesHz()
const centreHz = (b: number): number => Math.sqrt((EDGES[b] ?? 1) * (EDGES[b + 1] ?? 1))
const SWEEP_BANDS = Array.from({ length: SPECTRUM_BANDS }, (_, b) => b).filter((b) => centreHz(b) >= SWEEP_FROM_HZ)
const REGION_BANDS = REGIONS_HZ.map(([lo, hi]) => SWEEP_BANDS.filter((b) => centreHz(b) >= lo && centreHz(b) < hi))

const PER_WINDOW = ['ridge_slope', 'ridge_r2', 'shift_up', ...REGIONS_HZ.map((_, r) => `region${r}_slope`), 'rising_share'] as const

/** Every input a sweep model can read, in this order (sweep-model.json names the ones it uses). */
export const SWEEP_FEATURE_NAMES: readonly string[] = [
  ...WINDOWS.flatMap((steps) => PER_WINDOW.map((item) => `${steps / 2}s_${item}`)),
  'ridge_now', 'standout_now', ...REGIONS_HZ.map((_, r) => `region${r}_vs_peak`),
]

/** Every slot, with every input: for replaying clips and songs offline and retraining (sweep-eval.mts). */
export type SweepSlot = { t: number; features: number[]; probability: number }

const mean = (values: readonly number[]): number => (values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0)

// Least-squares slope (per step) and R squared of `values` against their index.
const fit = (values: readonly number[]): { slope: number; r2: number } => {
  const n = values.length
  if (n < 2) return { slope: 0, r2: 0 }
  const meanX = (n - 1) / 2
  const meanY = mean(values)
  let sxy = 0
  let sxx = 0
  let syy = 0
  values.forEach((v, i) => {
    sxy += (i - meanX) * (v - meanY)
    sxx += (i - meanX) ** 2
    syy += (v - meanY) ** 2
  })
  return { slope: sxx > 0 ? sxy / sxx : 0, r2: sxx > 0 && syy > 0 ? (sxy * sxy) / (sxx * syy) : 0 }
}

// Where the standing-out energy sits, in bands (0 is the lowest sweep band), and how far it stands out at most (dB).
const ridgeOf = (residual: readonly number[]): { at: number; standout: number } => {
  let weight = 0
  let sum = 0
  let standout = 0
  residual.forEach((r, i) => {
    if (r <= 0) return
    weight += r * r
    sum += r * r * i
    standout = Math.max(standout, r)
  })
  return { at: weight > 0 ? sum / weight : 0, standout }
}

// How much `now` looks like `before` moved up the spectrum rather than down: the correlation with `before` shifted up by one and two bands,
// less shifted down, over the correlation unshifted (so a loud and a quiet pattern count the same).
const shiftUp = (before: readonly number[], now: readonly number[]): number => {
  const corr = (shift: number): number => {
    let sum = 0
    for (let i = Math.max(0, shift); i < now.length && i - shift < before.length; i++) sum += (now[i] ?? 0) * (before[i - shift] ?? 0)
    return sum
  }
  const level = corr(0)
  const norm = Math.sqrt(now.reduce((s, v) => s + v * v, 0) * before.reduce((s, v) => s + v * v, 0))
  if (norm <= 0) return 0
  return SHIFTS.reduce((s, k) => s + corr(k) - corr(-k), 0) / Math.max(norm, Math.abs(level))
}

/**
 * Every input in SWEEP_FEATURE_NAMES' order, from half-second means of the 40 bands in dB, oldest first (up to 8 s). Per window (2, 4 and
 * 8 s): the ridge's slope (bands a second) and R squared, the mean shift up between consecutive steps, each region's slope (dB a second)
 * and the share of sweep bands rising; then the ridge now, how far it stands out now, and each region against its peak in the 8 s.
 */
export const sweepFeatures = (steps: ReadonlyArray<readonly number[]>): number[] => {
  const now = steps[steps.length - 1]
  if (!now || steps.length < MIN_STEPS) return new Array<number>(SWEEP_FEATURE_NAMES.length).fill(0)
  const perSecond = 1000 / (TICK_MS * TICKS_PER_STEP)
  const baseline = SWEEP_BANDS.map((b) => mean(steps.map((s) => s[b] ?? 0)))
  const residuals = steps.map((s) => SWEEP_BANDS.map((b, i) => (s[b] ?? 0) - (baseline[i] ?? 0)))
  const ridges = residuals.map(ridgeOf)
  const region = (s: readonly number[], r: number): number => mean((REGION_BANDS[r] ?? []).map((b) => s[b] ?? 0))
  const trends = WINDOWS.flatMap((size) => {
    const recent = steps.slice(-size)
    const recentResiduals = residuals.slice(-size)
    const line = fit(ridges.slice(-size).map(({ at }) => at))
    const shifts = recentResiduals.slice(1).map((r, i) => shiftUp(recentResiduals[i] ?? [], r))
    const regionSlopes = REGIONS_HZ.map((_, r) => fit(recent.map((s) => region(s, r))).slope * perSecond)
    const rising = SWEEP_BANDS.filter((b) => fit(recent.map((s) => s[b] ?? 0)).slope > 0).length / SWEEP_BANDS.length
    return [line.slope * perSecond, line.r2, mean(shifts), ...regionSlopes, rising]
  })
  const last = ridges[ridges.length - 1] ?? { at: 0, standout: 0 }
  const vsPeak = REGIONS_HZ.map((_, r) => region(now, r) - Math.max(...steps.map((s) => region(s, r))))
  return [...trends, last.at, last.standout, ...vsPeak]
}

const MODEL_INPUTS = MODEL.features.map((name) => {
  const at = SWEEP_FEATURE_NAMES.indexOf(name)
  if (at < 0) throw new Error(`sweep-model.json reads an unknown feature: ${name}`)
  return at
})

const dense = ({ weights, bias }: Layer, input: readonly number[]): number[] =>
  weights.map((row, j) => row.reduce((sum, w, i) => sum + w * (input[i] ?? 0), bias[j] ?? 0))

/** The model's probability that a sweep is playing, from every input (sweepFeatures). */
export const sweepProbability = (features: readonly number[]): number => {
  const scaled = MODEL_INPUTS.map((at, i) => ((features[at] ?? 0) - (MODEL.mean[i] ?? 0)) / (MODEL.scale[i] ?? 1))
  const score = dense(MODEL.output, dense(MODEL.hidden, scaled).map(Math.tanh))[0] ?? 0
  return 1 / (1 + Math.exp(-score))
}

/**
 * Reads the pooled spectrum (SpectrumReducer) every frame, or recorded 50 ms ticks (pushTick), and keeps the smoothed score. Frames are
 * pooled into 50 ms ticks the way the training recorder pools them (TickExtrasAccumulator: the mean of each band, rounded), so a recorded
 * session replays exactly.
 */
export class SweepDetector {
  private readonly tickSums = new Float64Array(SPECTRUM_BANDS)
  private tickFrames = 0
  private tickStart: number | null = null
  private readonly ticks: number[][] = []
  private ticksSinceSlot = 0
  private readonly steps: number[][] = []
  private score = 0
  private lastT: number | null = null
  private quietSlots = 0

  constructor(private readonly onSlot?: (slot: SweepSlot) => void) {}

  /** One frame's pooled spectrum (0 to 255 per band). */
  push = (t: number, bands: ArrayLike<number>): void => {
    if (this.tickStart === null) this.tickStart = t
    for (let b = 0; b < SPECTRUM_BANDS; b++) this.tickSums[b]! += bands[b] ?? 0
    this.tickFrames++
    if (t - this.tickStart < TICK_MS - 0.5) return
    const tick = Array.from(this.tickSums, (sum) => Math.round(sum / this.tickFrames))
    this.tickSums.fill(0)
    this.tickFrames = 0
    this.tickStart = nextSlotStart(this.tickStart, t, TICK_MS)
    this.pushTick(t, tick)
  }

  /** One 50 ms tick's spectrum (0 to 255 per band), as the recorder keeps it. */
  pushTick = (t: number, bands: readonly number[]): void => {
    this.ticks.push(bands.map((v) => v * DB_PER_BYTE))
    if (this.ticks.length > TICKS_PER_STEP) this.ticks.shift()
    if (++this.ticksSinceSlot < TICKS_PER_SLOT) return
    this.ticksSinceSlot = 0
    if (this.ticks.length < TICKS_PER_STEP) return
    // The half second ending now, every slot, so the steps' grid moves with the reading instead of jumping each half second.
    const step = Array.from({ length: SPECTRUM_BANDS }, (_, b) => mean(this.ticks.map((tick) => tick[b] ?? 0)))
    this.steps.push(step)
    // Steps a half second apart: every fifth slot's mean, back from now.
    const spaced = (TICKS_PER_STEP / TICKS_PER_SLOT) * HISTORY_STEPS
    if (this.steps.length > spaced) this.steps.shift()
    const quiet = Math.max(...this.steps.map(mean)) - mean(step) >= GAP_DB
    this.quietSlots = quiet ? this.quietSlots + 1 : 0
    if (this.quietSlots === GAP_SLOTS) this.forgetBeforeGap()
    const every = TICKS_PER_STEP / TICKS_PER_SLOT
    const history = this.steps.filter((_, i) => (this.steps.length - 1 - i) % every === 0)
    const features = sweepFeatures(history)
    const probability = history.length >= MIN_STEPS ? sweepProbability(features) : 0
    const dt = this.lastT === null ? TICK_MS * TICKS_PER_SLOT : t - this.lastT
    this.lastT = t
    this.score += (probability - this.score) * (1 - Math.exp(-dt / (probability >= this.score ? RISE_MS : FALL_MS)))
    this.onSlot?.({ t, features, probability })
  }

  /** The smoothed score, 0 to 1. */
  getScore = (): number => this.score

  reset = (): void => {
    this.tickSums.fill(0)
    this.tickFrames = 0
    this.tickStart = null
    this.ticks.length = 0
    this.ticksSinceSlot = 0
    this.steps.length = 0
    this.score = 0
    this.lastT = null
    this.quietSlots = 0
  }

  // After a gap, every step before it reads as the gap now (see riser.ts).
  private forgetBeforeGap = (): void => {
    const level = this.steps[this.steps.length - 1] ?? []
    for (let i = 0; i < this.steps.length - 1; i++) this.steps[i] = [...level]
  }
}

export const sweepDetector = new SweepDetector()
