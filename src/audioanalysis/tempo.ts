/** A tempo guessed from when drum onsets were detected. */
export type TempoEstimate = {
  bpm: number
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
const SEARCH_STEP_MS = 0.5

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

// The period whose grid the onsets line up on best. Neighboring gaps are not used, so syncopated hits between the beats (which make the gaps uneven) do not move it.
const bestPeriod = (onsets: readonly number[]): number => {
  let best = SEARCH_MIN_PERIOD_MS
  let bestScore = -1
  for (let period = SEARCH_MIN_PERIOD_MS; period <= SEARCH_MAX_PERIOD_MS; period += SEARCH_STEP_MS) {
    const score = alignment(onsets, period)
    if (score > bestScore + 1e-9) {
      best = period
      bestScore = score
    }
  }
  return best
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
  const gridPeriod = bestPeriod(onsets)
  const bpm = foldIntoRange(60000 / gridPeriod)
  const period = 60000 / bpm
  const gaps = onsets.slice(1).map((time, i) => time - (onsets[i] ?? time)).filter((gap) => gap > 0)
  if (gaps.length < MIN_ONSETS - 1) return null
  // A gap is steady when it is one beat or one step of the grid the onsets sit on (a half-time or eighth-note pattern has gaps of 2 beats or half a beat).
  const isNear = (gap: number, length: number): boolean => Math.abs(gap - length) <= length * TOLERANCE
  const steady = gaps.filter((gap) => isNear(gap, period) || isNear(gap, gridPeriod)).length
  return { bpm, consistency: steady / gaps.length, onsets: onsetTimesMs.length }
}
