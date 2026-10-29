/** A tempo guessed from when drum onsets were detected. */
export type TempoEstimate = {
  bpm: number
  /** Share (0 to 1) of the gaps between onsets that sit within `TOLERANCE` of the beat period: 1 is a perfectly steady beat. */
  confidence: number
  onsets: number
}

// Fewer onsets than this say nothing about a tempo.
const MIN_ONSETS = 6
// Tempos are folded into this range, so a half-time or double-time reading is reported as the likelier beat.
const MIN_BPM = 70
const MAX_BPM = 180
// How far a gap may be from the beat period and still count as one beat.
const TOLERANCE = 0.15
// A gap this many beat periods long is a quiet or missed beat, not a different tempo.
const MAX_MISSED_PERIODS = 3

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] ?? 0
}

const foldIntoRange = (bpm: number): number => {
  if (bpm <= 0) return bpm
  let folded = bpm
  while (folded < MIN_BPM) folded *= 2
  while (folded > MAX_BPM) folded /= 2
  return folded
}

/**
 * The tempo of a run of drum onsets (times in ms, oldest first), or null when there are too few or they are too uneven to say.
 * The beat period is the typical gap between onsets; a gap about two or three periods long counts as that many periods (a missed
 * beat), so one quiet hit does not throw the estimate off.
 */
export const estimateTempo = (onsetTimesMs: readonly number[]): TempoEstimate | null => {
  if (onsetTimesMs.length < MIN_ONSETS) return null
  const gaps = onsetTimesMs.slice(1).map((time, i) => time - (onsetTimesMs[i] ?? time)).filter((gap) => gap > 0)
  if (gaps.length < MIN_ONSETS - 1) return null
  const rough = median(gaps)
  if (rough <= 0) return null
  const usable = gaps.flatMap((gap) => {
    const count = Math.max(1, Math.round(gap / rough))
    return count <= MAX_MISSED_PERIODS && Math.abs(gap / count - rough) <= rough * TOLERANCE ? [{ gap, count }] : []
  })
  if (usable.length < MIN_ONSETS / 2) return null
  // The usable stretch divided by the beats in it: timing wobble on single onsets cancels out, where the middle gap alone would pick a side.
  const period = usable.reduce((sum, { gap }) => sum + gap, 0) / usable.reduce((sum, { count }) => sum + count, 0)
  const steady = gaps.filter((gap) => Math.abs(gap - period) <= period * TOLERANCE).length
  return { bpm: foldIntoRange(60000 / period), confidence: steady / gaps.length, onsets: onsetTimesMs.length }
}
