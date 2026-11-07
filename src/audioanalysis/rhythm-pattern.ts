import { TempoPattern } from './tempo'

/** What the rhythm namer reads: each onset band's own hits over the last few bars (ms, oldest first) and the tempo tracker's beat. */
export type RhythmInput = {
  bandOnsets: ReadonlyArray<readonly number[]>
  periodMs: number | null
}

export type RhythmOptions = {
  /** How far (ms) from exactly n beats later a second hit may land and still count as the same pattern repeating. */
  partnerToleranceMs: number
  /** Four on the floor: the kick repeats a beat, two beats and four beats later this often (the mean share of kicks that do), at least. */
  fourShare: number
  /** ...and the kick (bass band) hits at least this often per beat. */
  minKicksPerBeat: number
  /** Below four on the floor, the drums still play (bass or hi band hits per beat, the app's beat bands) at least this often to be called syncopated. */
  minDrumsPerBeat: number
  /** The span the onsets are counted over (the window they were taken from). */
  windowMs: number
}

// Tuned on half the tracks (Raveform folds 0 to 3, half of GiantSteps clean and through a laptop mic) by pattern-score.py.
export const DEFAULT_RHYTHM_OPTIONS: RhythmOptions = {
  partnerToleranceMs: 40,
  fourShare: 0.5,
  minKicksPerBeat: 0.3,
  minDrumsPerBeat: 0.4,
  windowMs: 12000,
}

const BASS = 0
const HI = 3
const KICK_REPEATS = [1, 2, 4]

// The share of onsets (those early enough to have one) with another onset `lagMs` later, give or take `toleranceMs`. Reads the pattern
// repeating, so an extra hit between the kicks (a bass note, a tom) does not break it the way it breaks the gaps between neighbours.
const repeatShare = (onsets: readonly number[], lagMs: number, toleranceMs: number): number => {
  const last = onsets[onsets.length - 1]
  if (last === undefined) return 0
  let considered = 0
  let repeated = 0
  let j = 0
  for (const time of onsets) {
    if (time > last - lagMs + toleranceMs) break
    considered++
    const target = time + lagMs
    while (j < onsets.length && (onsets[j] ?? Infinity) < target - toleranceMs) j++
    if (j < onsets.length && Math.abs((onsets[j] ?? Infinity) - target) <= toleranceMs) repeated++
  }
  return considered < 2 ? 0 : repeated / considered
}

/**
 * The rhythm the drums make against the beat, from each onset band's own hits (not the merged beats, which mix kick and hats and drop
 * whatever lands within the Ignore Time). Four on the floor when the kick repeats every beat; syncopated when the drums play but the kick
 * does not keep the beat (breakbeats, two-step, half time); null with no beat or too few hits to say (a breakdown, silence).
 */
export const nameRhythm = ({ bandOnsets, periodMs }: RhythmInput, options: Partial<RhythmOptions> = {}): TempoPattern | null => {
  const o = { ...DEFAULT_RHYTHM_OPTIONS, ...options }
  if (periodMs === null || periodMs <= 0) return null
  const beats = o.windowMs / periodMs
  const kicks = bandOnsets[BASS] ?? []
  const hi = bandOnsets[HI] ?? []
  const kickRepeat = KICK_REPEATS.reduce((sum, n) => sum + repeatShare(kicks, n * periodMs, o.partnerToleranceMs), 0) / KICK_REPEATS.length
  if (kicks.length / beats >= o.minKicksPerBeat && kickRepeat >= o.fourShare) return 'four on the floor'
  if (Math.max(kicks.length, hi.length) / beats >= o.minDrumsPerBeat) return 'syncopated'
  return null
}
