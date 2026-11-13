import modelData from './riser-model.json'
import { checkMlpShape, fit, inputIndexes, scoreProbability, type MlpModel } from '../shared/mlp'

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
// The shown score follows the model's this fast (ms): up over RISE_MS, so a slot or two of doubt does not flicker it, and down over FALL_MS,
// so it lets go soon after a riser stops (under 0.4 a median of 0.26 s after a synthetic riser's end, against 0.48 s with 400 ms both
// ways) and a false reading on real music is over sooner (on SSME, about 1.5 points less of the time outside builds on the meter).
const RISE_MS = 400
const FALL_MS = 150
// A gap: the mix this far (dB) under its loudest slot of the last 8 s for this many slots in a row (the pause between two samples, or
// before a drop). The trends and peaks would otherwise measure the next sound against the last one for up to 32 s, so a riser that starts
// within 8 s of something louder read as flat until it got past it. On synthetic risers played 1 to 4 s after a sample as loud or louder
// (the user auditioning risers one after another), with the sweep, the meter showed 81% of them, a median of 4 s in; with the gap 99.6%,
// 1.1 s in. Clearing the history instead, so it starts with the next sound, showed 91%, 2.6 s in: the model needs the quiet lead-in its
// training risers had. On real music this calls 12 to 20 gaps an hour and 2 in 100 buildups' last halves, and adds about 0.3 points of
// meter time outside buildups on held-out Raveform tracks (riser only) and 0.8 on SSME. See scripts/section-eval/DRUM-HITS.md.
const GAP_DB = 25
const GAP_SLOTS = 5

export type RiserModel = MlpModel
/** The bundled riser model (riser-model.json); `RiserDetector` takes another as its second argument. */
export const RISER_MODEL: RiserModel = modelData

/** Every slot, with every input (riserFeatures): for replaying clips and songs offline and retraining (drum-eval.mts). */
export type RiserSlot = { t: number; features: number[]; probability: number }

const toDb = (power: number): number => 10 * Math.log10(power + POWER_EPS)

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
  const band = (b: number): ((dbs: readonly number[]) => number) => (dbs) => dbs[b] ?? 0
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
  const secondMeans = (value: (dbs: readonly number[]) => number): number[] => meansOf(history.map(value), perSecond)
  const bass = secondMeans((dbs) => dbs[0] ?? 0)
  const highsSeries = secondMeans(highs)
  const totalSeries = secondMeans(total)
  const series = [bass, secondMeans((dbs) => dbs[2] ?? 0), highsSeries, totalSeries]
  if (bass.length < 2) return new Array<number>(LONG_WINDOWS.length * LONG_ITEMS.length + 4).fill(0)
  const slopes = LONG_WINDOWS.flatMap((seconds) => series.map((values) => fit(values.slice(-seconds)).slope))
  const last = (values: readonly number[]): number => values[values.length - 1] ?? 0
  const vsPeak = (values: readonly number[]): number => last(values) - Math.max(...values)
  const bassPeak = Math.max(...bass)
  const lastLoud = bass.reduce((at, v, i) => (v > bassPeak - BASS_GONE_DB ? i : at), 0)
  return [...slopes, vsPeak(bass), vsPeak(highsSeries), vsPeak(totalSeries), bass.length - 1 - lastLoud]
}

// Where each of the model's inputs sits in RISER_FEATURE_NAMES.
// Checks the model's shape, then maps its inputs by name (so a model may read any subset of the features, in any order).
const riserInputs = (model: RiserModel): number[] => {
  checkMlpShape(model, 'riser-model.json')
  return inputIndexes(model, RISER_FEATURE_NAMES, 'riser-model.json')
}

/** The model's probability that the slot is inside a riser, from every input (riserFeatures). */
export const riserProbability = (features: readonly number[], model: RiserModel = RISER_MODEL): number =>
  scoreProbability(model, riserInputs(model), features)

/**
 * Where the next slot starts once one closes at `t`: a fixed step on from where the closed one started, so slots average `slotMs` at any
 * frame rate (at 30 fps, 50 ms ticks close after 2 frames then 1, not always 2, which made them 67 ms). After a stall longer than a slot,
 * the next one starts at `t` instead of catching up.
 */
export const nextSlotStart = (start: number, t: number, slotMs: number): number => {
  const next = start + slotMs
  return t - next >= slotMs ? t : next
}

/** Runs every frame beside the beat detector, on the raw band levels. */
export class RiserDetector {
  private readonly sums = new Float64Array(BAND_COUNT)
  private frames = 0
  private slotStart: number | null = null
  private readonly slots: number[][] = []
  private score = 0
  private lastT: number | null = null
  private quietSlots = 0

  private readonly inputs: number[]

  constructor(private readonly onSlot?: (slot: RiserSlot) => void, private readonly model: RiserModel = RISER_MODEL) {
    this.inputs = riserInputs(model)
  }

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
    this.quietSlots = 0
  }

  // After a gap, every slot before it reads as the gap now: the next sound rises out of silence, the way the training clips' risers did.
  private forgetBeforeGap = (): void => {
    const level = this.slots[this.slots.length - 1] ?? []
    for (let i = 0; i < this.slots.length - 1; i++) this.slots[i] = [...level]
  }

  private closeSlot = (t: number): void => {
    this.slots.push(Array.from(this.sums, (sum) => toDb(sum / Math.max(1, this.frames))))
    if (this.slots.length > HISTORY_SLOTS) this.slots.shift()
    const mix = (dbs: readonly number[]): number => toDb(dbs.reduce((sum, d) => sum + 10 ** (d / 10), 0))
    const recent = this.slots.slice(-SHORT_SLOTS)
    const quiet = Math.max(...recent.map(mix)) - mix(recent[recent.length - 1] ?? []) >= GAP_DB
    this.quietSlots = quiet ? this.quietSlots + 1 : 0
    if (this.quietSlots === GAP_SLOTS) this.forgetBeforeGap()
    this.sums.fill(0)
    this.frames = 0
    this.slotStart = nextSlotStart(this.slotStart ?? t, t, SLOT_MS)
    const features = riserFeatures(this.slots)
    const probability = this.slots.length >= MIN_SLOTS ? scoreProbability(this.model, this.inputs, features) : 0
    const dt = this.lastT === null ? SLOT_MS : t - this.lastT
    this.lastT = t
    this.score += (probability - this.score) * (1 - Math.exp(-dt / (probability >= this.score ? RISE_MS : FALL_MS)))
    this.onSlot?.({ t, features, probability })
  }
}
