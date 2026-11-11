import modelData from './riser-model.json'

// How much the music sounds like a riser right now (a noise sweep, a pitch riser, a high-passed whoosh): 0 to 1, for the Frequency HUD
// and, read offline, for the section model. A riser is not a hit but a climb over bars, so instead of onsets this follows the five band
// levels in 100 ms slots and reads their trend over the last 2, 4 and 8 seconds (how fast each band is rising, how steady the climb is,
// whether the highs are at their peak) and over 32 s of context. A small model (riser-model.json: one hidden layer of tanh units and a
// sigmoid) turns that into a score, which is smoothed. The installed model reads only the mid, hi and air bands, so the kick and bass
// dropping out (a breakdown) does not look like a climb. It was trained on synthetic risers over drums and melodic beds against fade-ins,
// steady noise, downlifters and synthetic breakdowns, plus drops and early breakdowns of real songs (Raveform sections) as negatives. See
// scripts/section-eval/DRUM-HITS.md (drum-gen.py, drum-eval.mts, riser-train.py, riser-score.py).
const BAND_COUNT = 5
const SLOT_MS = 100
// 32 s of slots: the trend windows read the last 8 s, the long context all of it.
const HISTORY_SLOTS = 320
// The trend windows, in slots.
const WINDOWS = [20, 40, 80] as const
const SHORT_SLOTS = 80
// The long context's windows, in seconds, read from one-second means (so single hits do not count).
const LONG_WINDOWS = [16, 32] as const
// Seconds the bass has been this far (dB) under its peak in the long context.
const BASS_GONE_DB = 6
// Fewest slots a trend is read from; before that the features are zero.
const MIN_SLOTS = 10
const POWER_EPS = 1e-6
// The shown score follows the model's this fast (ms), so a slot or two of doubt does not flicker it.
const SMOOTH_MS = 400

/** A dense layer: `weights[out][in]`. */
type Layer = { weights: number[][]; bias: number[] }
type RiserModel = { features: string[]; mean: number[]; scale: number[]; hidden: Layer; output: Layer }
const MODEL: RiserModel = modelData

/** Every slot, with every input (riserFeatures): for replaying clips and songs offline and retraining (drum-eval.mts). */
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

// Theil-Sen slope (per slot): the median of the slopes between every pair, so one step (the kit dropping out, a crash) does not tilt it.
const robustSlope = (values: readonly number[]): number => {
  const slopes: number[] = []
  for (let i = 0; i < values.length; i++) for (let j = i + 1; j < values.length; j++) slopes.push(((values[j] ?? 0) - (values[i] ?? 0)) / (j - i))
  if (slopes.length === 0) return 0
  slopes.sort((a, b) => a - b)
  const mid = Math.floor(slopes.length / 2)
  return slopes.length % 2 ? slopes[mid]! : (slopes[mid - 1]! + slopes[mid]!) / 2
}

// Means of `size` consecutive values, the last one ending on the newest value.
const meansOf = (values: readonly number[], size: number): number[] => {
  const means: number[] = []
  for (let at = values.length % size; at + size <= values.length; at += size) means.push(values.slice(at, at + size).reduce((sum, v) => sum + v, 0) / size)
  return means
}

// The share of steps between consecutive means of `size` slots that go up: near 1 for a steady climb, about half for a level that only jumps.
const riseShare = (values: readonly number[], size: number): number => {
  const means = meansOf(values, size)
  if (means.length < 2) return 0
  return means.slice(1).filter((v, i) => v > means[i]!).length / (means.length - 1)
}

const WINDOW_ITEMS = ['slope_bass', 'slope_lo', 'slope_mid', 'slope_hi', 'slope_air', 'slope_centroid', 'slope_tilt', 'r2_highs'] as const
const EXTRA_WINDOW_ITEMS = ['robust_slope_highs', 'robust_slope_mid'] as const
const LONG_ITEMS = ['slope_bass', 'slope_mid', 'slope_highs', 'slope_total'] as const

/**
 * Every input a riser model can read, in this order (riser-model.json names the ones it uses). Per window (2, 4 and 8 s): each band's slope
 * (dB a second), the centroid's slope, the tilt's slope (highs against lows) and how well a line fits the highs (R squared); the hi band, the
 * air band and the whole mix against their highest slot in the 8 s, and the centroid now. Then the ones that do not move when the lows drop
 * out: per window the highs' and the mid band's step-proof slope (Theil-Sen over half-second means, dB a second); how steadily the highs climb
 * (the share of rising steps between half-second means over 4 s and one-second means over 8 s); the hi and air bands above their lowest slot
 * and the highs above their mean in the 8 s, and the mid band against its peak. Last, the long context, from one-second means over 32 s
 * (what a buildup has and a breakdown's start does not: the bass gone for a while, the mix climbing back): per long window (16 and 32 s) the
 * slopes of the bass, the mid band, the highs and the whole mix; the bass, the highs and the mix now against their peak, and the seconds the
 * bass has been more than 6 dB under its peak.
 */
export const RISER_FEATURE_NAMES: readonly string[] = [
  ...WINDOWS.flatMap((size) => WINDOW_ITEMS.map((item) => `${size / 10}s_${item}`)),
  'hi_vs_peak', 'air_vs_peak', 'total_vs_peak', 'centroid',
  ...WINDOWS.flatMap((size) => EXTRA_WINDOW_ITEMS.map((item) => `${size / 10}s_${item}`)),
  '4s_rise_share_highs', '8s_rise_share_highs', 'hi_vs_min', 'air_vs_min', 'highs_vs_mean', 'mid_vs_peak',
  ...LONG_WINDOWS.flatMap((seconds) => LONG_ITEMS.map((item) => `${seconds}s_${item}`)),
  'bass_vs_peak_32s', 'highs_vs_peak_32s', 'total_vs_peak_32s', 'bass_gone_s',
]

/** Every input in RISER_FEATURE_NAMES' order, from the slots' levels in dB (up to 32 s), oldest first. Zero before a second of slots. */
export const riserFeatures = (history: ReadonlyArray<readonly number[]>): number[] => {
  const perSecond = 1000 / SLOT_MS
  const now = history[history.length - 1]
  if (!now || history.length < MIN_SLOTS) return new Array<number>(RISER_FEATURE_NAMES.length).fill(0)
  const slots = history.slice(-SHORT_SLOTS)
  const band = (b: number) => (dbs: readonly number[]): number => dbs[b] ?? 0
  const trends = WINDOWS.flatMap((size) => {
    const recent = slots.slice(-size)
    const bandSlopes = Array.from({ length: BAND_COUNT }, (_, b) => fit(recent.map(band(b))).slope * perSecond)
    return [
      ...bandSlopes,
      fit(recent.map(centroidOf)).slope * perSecond,
      fit(recent.map(tiltOf)).slope * perSecond,
      fit(recent.map(highs)).r2,
    ]
  })
  const robust = WINDOWS.flatMap((size) => {
    const recent = slots.slice(-size)
    const half = perSecond / 2
    return [robustSlope(meansOf(recent.map(highs), half)) * 2, robustSlope(meansOf(recent.map(band(2)), half)) * 2]
  })
  const total = (dbs: readonly number[]): number => toDb(dbs.reduce((sum, d) => sum + 10 ** (d / 10), 0))
  const long = longContext(history, total)
  const peak = (value: (dbs: readonly number[]) => number): number => Math.max(...slots.map(value))
  const low = (value: (dbs: readonly number[]) => number): number => Math.min(...slots.map(value))
  const [hi, air, mid] = [band(3), band(4), band(2)]
  const highsNow = highs(now)
  const highsMean = slots.reduce((sum, dbs) => sum + highs(dbs), 0) / slots.length
  return [
    ...trends,
    hi(now) - peak(hi), air(now) - peak(air), total(now) - peak(total), centroidOf(now),
    ...robust,
    riseShare(slots.slice(-40).map(highs), 5), riseShare(slots.map(highs), 10),
    hi(now) - low(hi), air(now) - low(air), highsNow - highsMean, mid(now) - peak(mid),
    ...long,
  ]
}

// The long context's inputs (see RISER_FEATURE_NAMES), from one-second means of the history; zero until there are two seconds.
const longContext = (history: ReadonlyArray<readonly number[]>, total: (dbs: readonly number[]) => number): number[] => {
  const perSecond = 1000 / SLOT_MS
  const series = [(dbs: readonly number[]) => dbs[0] ?? 0, (dbs: readonly number[]) => dbs[2] ?? 0, highs, total]
    .map((value) => meansOf(history.map(value), perSecond))
  const [bass, , highsSeries, totalSeries] = series as [number[], number[], number[], number[]]
  if (bass.length < 2) return new Array<number>(LONG_WINDOWS.length * LONG_ITEMS.length + 4).fill(0)
  const slopes = LONG_WINDOWS.flatMap((seconds) => series.map((values) => fit(values.slice(-seconds)).slope))
  const last = (values: readonly number[]): number => values[values.length - 1] ?? 0
  const vsPeak = (values: readonly number[]): number => last(values) - Math.max(...values)
  const bassPeak = Math.max(...bass)
  const lastLoud = bass.reduce((at, v, i) => (v > bassPeak - BASS_GONE_DB ? i : at), 0)
  return [...slopes, vsPeak(bass), vsPeak(highsSeries), vsPeak(totalSeries), bass.length - 1 - lastLoud]
}

const dense = ({ weights, bias }: Layer, input: readonly number[]): number[] =>
  weights.map((row, j) => row.reduce((sum, w, i) => sum + w * (input[i] ?? 0), bias[j] ?? 0))

// Where each of the model's inputs sits in RISER_FEATURE_NAMES.
const MODEL_INPUTS = MODEL.features.map((name) => {
  const at = RISER_FEATURE_NAMES.indexOf(name)
  if (at < 0) throw new Error(`riser-model.json reads an unknown feature: ${name}`)
  return at
})

/** The model's probability that the slot is inside a riser, from every input (riserFeatures). */
export const riserProbability = (features: readonly number[]): number => {
  const scaled = MODEL_INPUTS.map((at, i) => ((features[at] ?? 0) - (MODEL.mean[i] ?? 0)) / (MODEL.scale[i] ?? 1))
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
