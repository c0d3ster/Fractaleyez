/** What the hits are doing against the beat, when that is clear enough to name. */
export type TempoPattern = 'four on the floor' | 'half time' | 'double time' | 'syncopated'

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
const SEARCH_MIN_PERIOD_MS = 60000 / 360
const SEARCH_MAX_PERIOD_MS = 60000 / 50
// How sharp the alignment peak is around a period: about P^2 / span wide, where span is the time the onsets cover. The search steps in fractions of it
// (coarse across the whole range, fine around the best spot), so a short run of onsets costs a few hundred candidates, not thousands.
const COARSE_STEP = 0.35
const FINE_STEP = 0.03
const MIN_COARSE_STEP_MS = 0.5
const MIN_FINE_STEP_MS = 0.1
// A longer period counts as the same grid when onsets line up on it about as well, and is preferred: onsets every beat also line up on every half beat.
const LONGER_PERIOD_SCORE = 0.98
const LONGER_PERIOD_SPREAD = 0.03
const LONGER_PERIOD_MULTIPLES = [2, 3]
// A pattern is only named when the onsets line up on the grid at least this well.
const MIN_PATTERN_ALIGNMENT = 0.75
// Onsets this close (as a share of a beat) to the beat count as on it.
const ON_BEAT = 0.15
const SHARE_ON_BEAT = 0.85
const SHARE_EVEN_EIGHTHS = 0.8

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

// The best period from `from` to `to`, stepping by `stepOf(period)`. The shortest wins a tie.
const scan = (onsets: readonly number[], from: number, to: number, stepOf: (period: number) => number): Peak => {
  let best: Peak = { period: from, score: -1 }
  for (let period = from; period <= to; period += stepOf(period)) {
    const score = alignment(onsets, period)
    if (score > best.score + 1e-9) best = { period, score }
  }
  return best
}

// The period whose grid the onsets line up on best. Neighboring gaps are not used, so syncopated hits between the beats (which make the gaps uneven) do not move it.
const bestPeriod = (onsets: readonly number[]): Peak => {
  const span = Math.max(onsets[onsets.length - 1] ?? 0, 1)
  const coarseStep = (period: number): number => Math.max(MIN_COARSE_STEP_MS, COARSE_STEP * peakWidth(period, span))
  const fineStep = (period: number): number => Math.max(MIN_FINE_STEP_MS, FINE_STEP * peakWidth(period, span))
  const coarse = scan(onsets, SEARCH_MIN_PERIOD_MS, SEARCH_MAX_PERIOD_MS, coarseStep)
  const reach = coarseStep(coarse.period)
  let best = scan(onsets, Math.max(SEARCH_MIN_PERIOD_MS, coarse.period - reach), Math.min(SEARCH_MAX_PERIOD_MS, coarse.period + reach), fineStep)

  // The shortest period wins a tie, so climb to the longest multiple of it that the onsets line up on just as well.
  const longerThan = (peak: Peak): Peak | null => {
    for (const multiple of LONGER_PERIOD_MULTIPLES) {
      const center = peak.period * multiple
      if (center * (1 - LONGER_PERIOD_SPREAD) > SEARCH_MAX_PERIOD_MS) continue
      const longer = scan(onsets, center * (1 - LONGER_PERIOD_SPREAD), Math.min(center * (1 + LONGER_PERIOD_SPREAD), SEARCH_MAX_PERIOD_MS), fineStep)
      if (longer.score >= best.score * LONGER_PERIOD_SCORE) return longer
    }
    return null
  }
  for (let next = longerThan(best); next; next = longerThan(best)) best = next
  return best
}

// Where each onset falls against the beat: -0.5 to 0.5 of a beat, 0 being on it. The phase comes from the onsets themselves.
const beatOffsets = (onsets: readonly number[], period: number): number[] => {
  let cos = 0
  let sin = 0
  for (const time of onsets) {
    cos += Math.cos((2 * Math.PI * time) / period)
    sin += Math.sin((2 * Math.PI * time) / period)
  }
  const phase = Math.atan2(sin, cos) / (2 * Math.PI)
  return onsets.map((time) => {
    const turns = time / period - phase
    return turns - Math.round(turns)
  })
}

const namePattern = (onsets: readonly number[], gridPeriod: number, period: number): TempoPattern => {
  const offsets = beatOffsets(onsets, period)
  const onBeat = offsets.filter((offset) => Math.abs(offset) <= ON_BEAT).length / offsets.length
  if (onBeat >= SHARE_ON_BEAT) return gridPeriod > period * 1.5 ? 'half time' : 'four on the floor'
  const gaps = onsets.slice(1).map((time, i) => time - (onsets[i] ?? time))
  const eighth = period / 2
  const evenEighths = gaps.filter((gap) => Math.abs(gap - eighth) <= eighth * TOLERANCE).length / Math.max(1, gaps.length)
  return evenEighths >= SHARE_EVEN_EIGHTHS ? 'double time' : 'syncopated'
}

/**
 * The tempo of a run of drum onsets (times in ms, oldest first), or null when there are too few to say.
 * The beat period is the one the onsets line up on best (any onset can sit on it, not only neighbors a beat apart), so syncopation,
 * a missed beat or hits on the off-beat do not throw the estimate off. Consistency is how many of the gaps are one beat (or one grid step) long.
 */
export const estimateTempo = (onsetTimesMs: readonly number[]): TempoEstimate | null => {
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
  const pattern = score >= MIN_PATTERN_ALIGNMENT ? namePattern(onsets, gridPeriod, period) : null
  return { bpm, pattern, consistency: steady / gaps.length, onsets: onsetTimesMs.length }
}
