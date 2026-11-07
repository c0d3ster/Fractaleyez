/** What the hits are doing against the beat, when that is clear enough to name. */
export type TempoPattern = 'four on the floor' | 'half time' | 'double time' | 'sixteenths' | 'dembow' | 'syncopated'

/** A tempo guessed from when drum onsets were detected. */
export type TempoEstimate = {
  bpm: number
  /** The rhythm the hits make against the beat, or null when they do not line up on a beat well enough to say. */
  pattern: TempoPattern | null
  /** Share (0 to 1) of the gaps between onsets that sit within `TOLERANCE` of the beat period or the onsets' grid step: 1 is a perfectly steady beat. */
  consistency: number
  onsets: number
}

// Fewer onsets than this say nothing about a tempo.
const MIN_ONSETS = 6
// Tempos are folded into this range, so a half-time or double-time reading is reported as the likelier beat.
const MIN_BPM = 70
const MAX_BPM = 180
// How far a gap may be from the beat period and still count as one beat.
const TOLERANCE = 0.15
// The beat period is searched over a wider range than the reported one, so a pattern living on an eighth or sixteenth grid is found as such and then folded.
const SEARCH_MIN_PERIOD_MS = 60000 / 720
const SEARCH_MAX_PERIOD_MS = 60000 / 50
// How sharp the alignment peak is around a period: about P^2 / span wide, where span is the time the onsets cover. The search steps in fractions of it
// (coarse across the whole range, fine around the best spot), so a short run of onsets costs a few hundred candidates, not thousands.
const COARSE_STEP = 0.35
const FINE_STEP = 0.03
const MIN_COARSE_STEP_MS = 0.5
const MIN_FINE_STEP_MS = 0.1
// Onsets that line up on a period also line up on every fraction of it (hits every beat sit on every half beat too), so the longest period that
// aligns about as well as the best one is the real grid. Only peaks within this share of the best score are looked at.
const SAME_GRID_SCORE = 0.98
const PEAK_CANDIDATE_SCORE = 0.9
/** The thresholds the pattern is named with (see DEFAULT_PATTERN_OPTIONS). Exposed so the offline evaluation can tune them. */
export type PatternOptions = {
  /** A pattern is only named when the onsets line up on the grid at least this well. */
  minAlignment: number
  /** How far from a beat (share of a beat) a hit still counts as on it. */
  onBeat: number
  /** How much of the run a pattern has to explain to be named. Lower than perfect, because the detector adds and misses hits on real music. */
  shareOnBeat: number
  shareBeatsHit: number
  shareSameParity: number
  shareEvenGaps: number
  shareDembow: number
}

export const DEFAULT_PATTERN_OPTIONS: PatternOptions = {
  minAlignment: 0.75,
  onBeat: 0.15,
  shareOnBeat: 0.65,
  shareBeatsHit: 0.8,
  shareSameParity: 0.9,
  shareEvenGaps: 0.8,
  shareDembow: 0.6,
}
// Dembow (and the tresillo) is 3+3+2 eighths, repeating.
const DEMBOW_STEPS = [2, 3, 3]
const STEP_TOLERANCE = 0.2

const foldIntoRange = (bpm: number): number => {
  if (bpm <= 0) return bpm
  let folded = bpm
  while (folded < MIN_BPM) folded *= 2
  while (folded > MAX_BPM) folded /= 2
  return folded
}

// How tightly the onsets line up on a grid of this period: 1 when every onset sits at the same phase, near 0 when they are spread evenly around it.
const alignment = (onsets: readonly number[], periodMs: number): number => {
  let cos = 0
  let sin = 0
  for (const time of onsets) {
    const angle = (2 * Math.PI * time) / periodMs
    cos += Math.cos(angle)
    sin += Math.sin(angle)
  }
  return Math.hypot(cos, sin) / onsets.length
}

type Peak = { period: number; score: number }

const peakWidth = (period: number, spanMs: number): number => (period * period) / spanMs

type Candidate = Peak & { index: number }

// Every period from `from` to `to`, stepping by `stepOf(period)`, with its alignment score.
const sweep = (onsets: readonly number[], from: number, to: number, stepOf: (period: number) => number): Peak[] => {
  const peaks: Peak[] = []
  for (let period = from; period <= to; period += stepOf(period)) peaks.push({ period, score: alignment(onsets, period) })
  return peaks
}

const highest = (peaks: readonly Peak[]): Peak => peaks.reduce((best, peak) => (peak.score > best.score ? peak : best), { period: 0, score: -1 })

// The period whose grid the onsets line up on best. Neighboring gaps are not used, so syncopated hits between the beats (which make the gaps uneven) do not move it.
const bestPeriod = (onsets: readonly number[]): Peak => {
  const span = Math.max(onsets[onsets.length - 1] ?? 0, 1)
  const coarseStep = (period: number): number => Math.max(MIN_COARSE_STEP_MS, COARSE_STEP * peakWidth(period, span))
  const fineStep = (period: number): number => Math.max(MIN_FINE_STEP_MS, FINE_STEP * peakWidth(period, span))
  const coarse = sweep(onsets, SEARCH_MIN_PERIOD_MS, SEARCH_MAX_PERIOD_MS, coarseStep)
  const top = highest(coarse).score
  // The tops of the coarse peaks that come close to the best; each is refined, since a coarse step can land a little off its peak.
  const candidates: Candidate[] = coarse.flatMap((peak, index) => {
    const before = coarse[index - 1]?.score ?? -1
    const after = coarse[index + 1]?.score ?? -1
    return peak.score >= top * PEAK_CANDIDATE_SCORE && peak.score >= before && peak.score >= after ? [{ ...peak, index }] : []
  })
  const refined = candidates.map(({ period }) => {
    const reach = coarseStep(period)
    return highest(sweep(onsets, Math.max(SEARCH_MIN_PERIOD_MS, period - reach), Math.min(SEARCH_MAX_PERIOD_MS, period + reach), fineStep))
  })
  const best = highest(refined)
  return refined.reduce((longest, peak) => (peak.score >= best.score * SAME_GRID_SCORE && peak.period > longest.period ? peak : longest), best)
}

// Where each onset falls against the beat, in beats from the beat grid (the phase comes from the onsets themselves).
const beatTurns = (onsets: readonly number[], period: number): number[] => {
  let cos = 0
  let sin = 0
  for (const time of onsets) {
    cos += Math.cos((2 * Math.PI * time) / period)
    sin += Math.sin((2 * Math.PI * time) / period)
  }
  const phase = Math.atan2(sin, cos) / (2 * Math.PI)
  return onsets.map((time) => time / period - phase)
}

const shareOf = <T>(values: readonly T[], matches: (value: T) => boolean): number =>
  values.length === 0 ? 0 : values.filter(matches).length / values.length

// How much of the gaps are `length` long, give or take `tolerance` of it.
const gapShare = (gaps: readonly number[], length: number, tolerance: number = TOLERANCE): number =>
  shareOf(gaps, (gap) => Math.abs(gap - length) <= length * tolerance)

// The share of runs of three gaps that are 3+3+2 eighths in some order.
const dembowShare = (gaps: readonly number[], eighth: number): number => {
  const steps = gaps.map((gap) => (Math.abs(gap - Math.round(gap / eighth) * eighth) <= eighth * STEP_TOLERANCE ? Math.round(gap / eighth) : 0))
  const runs = steps.slice(2).map((_, i) => [steps[i] ?? 0, steps[i + 1] ?? 0, steps[i + 2] ?? 0].sort((x, y) => x - y))
  return shareOf(runs, (run) => run.every((step, i) => step === DEMBOW_STEPS[i]))
}

// The share of the beats in the run that have a hit on them, and the share of those that are all odd or all even beats.
const beatCoverage = (turns: readonly number[], onBeatTolerance: number): { hit: number; sameParity: number; hitBeats: number; beats: number } => {
  const slots = turns.map(Math.round)
  const onBeat = new Set(turns.flatMap((turn, i) => (Math.abs(turn - (slots[i] ?? 0)) <= onBeatTolerance ? [slots[i] ?? 0] : [])))
  const beats = Math.max(1, Math.max(...slots) - Math.min(...slots) + 1)
  const odd = [...onBeat].filter((slot) => Math.abs(slot % 2) === 1).length
  const sameParity = onBeat.size === 0 ? 0 : Math.max(odd, onBeat.size - odd) / onBeat.size
  return { hit: onBeat.size / beats, sameParity, hitBeats: onBeat.size, beats }
}

const namePattern = (onsets: readonly number[], period: number, options: PatternOptions): TempoPattern => {
  const turns = beatTurns(onsets, period)
  const onBeat = shareOf(turns, (turn) => Math.abs(turn - Math.round(turn)) <= options.onBeat)
  const gaps = onsets.slice(1).map((time, i) => time - (onsets[i] ?? time)).filter((gap) => gap > 0)
  const coverage = beatCoverage(turns, options.onBeat)

  if (gapShare(gaps, period / 4) >= options.shareEvenGaps) return 'sixteenths'
  if (gapShare(gaps, period / 2) >= options.shareEvenGaps) return 'double time'
  if (onBeat >= options.shareOnBeat && coverage.hit >= options.shareBeatsHit) return 'four on the floor'
  // Every second beat only: the hits are all odd or all even beats, and they fill those.
  if (onBeat >= options.shareOnBeat && coverage.sameParity >= options.shareSameParity && coverage.hitBeats / Math.ceil(coverage.beats / 2) >= options.shareBeatsHit) {
    return 'half time'
  }
  if (dembowShare(gaps, period / 2) >= options.shareDembow) return 'dembow'
  return 'syncopated'
}

/**
 * The tempo of a run of drum onsets (times in ms, oldest first), or null when there are too few to say.
 * The beat period is the one the onsets line up on best (any onset can sit on it, not only neighbors a beat apart), so syncopation,
 * a missed beat or hits on the off-beat do not throw the estimate off. Consistency is how many of the gaps are one beat (or one grid step) long.
 */
export const estimateTempo = (onsetTimesMs: readonly number[], patternOptions: Partial<PatternOptions> = {}): TempoEstimate | null => {
  const options = { ...DEFAULT_PATTERN_OPTIONS, ...patternOptions }
  if (onsetTimesMs.length < MIN_ONSETS) return null
  const first = onsetTimesMs[0] ?? 0
  const onsets = onsetTimesMs.map((time) => time - first)
  const { period: gridPeriod, score } = bestPeriod(onsets)
  const bpm = foldIntoRange(60000 / gridPeriod)
  const period = 60000 / bpm
  const gaps = onsets.slice(1).map((time, i) => time - (onsets[i] ?? time)).filter((gap) => gap > 0)
  if (gaps.length < MIN_ONSETS - 1) return null
  // A gap is steady when it is one beat or one step of the grid the onsets sit on (a half-time or eighth-note pattern has gaps of 2 beats or half a beat).
  const isNear = (gap: number, length: number): boolean => Math.abs(gap - length) <= length * TOLERANCE
  const steady = gaps.filter((gap) => isNear(gap, period) || isNear(gap, gridPeriod)).length
  const pattern = score >= options.minAlignment ? namePattern(onsets, period, options) : null
  return { bpm, pattern, consistency: steady / gaps.length, onsets: onsetTimesMs.length }
}
