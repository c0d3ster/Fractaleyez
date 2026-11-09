/** How fast the drums are rolling against the beat: 1 is quarter notes, 2 eighths, 3 sixteenths. */
export type RollLevel = 1 | 2 | 3

/** The bands a roll shows up in: the snare's body and the clap's body. The kick (bass) is the beat itself and the hats (air) play steady eighths or sixteenths all song. */
export const ROLL_BANDS: readonly number[] = [1, 2]

// The same snare in two bands lands a frame or two apart; hits this close are one hit. Sixteenths at 150 BPM are 100 ms apart, so this stays under half of that.
const SAME_HIT_MS = 45
// Hits older than this many beats are not what the drums are doing now.
const WINDOW_BEATS = 2.5
// Fewest hits that say anything about a rate (two gaps), and the most gaps looked at, so a change of rate shows once most of the newest gaps are at it.
const MIN_HITS = 3
const MAX_GAPS = 3
// Where one note value ends and the next starts: halfway between them in the ratio of gap to beat (geometric, since each is half the one before).
const QUARTER_FLOOR = Math.SQRT1_2
const EIGHTH_FLOOR = Math.SQRT1_2 / 2

/** The hits of the given bands within `sinceMs`, oldest first, with the same hit seen in two bands counted once. */
const recentHits = (bandOnsets: ReadonlyArray<readonly number[]>, bands: readonly number[], sinceMs: number): number[] => {
  const times = bands.flatMap((band) => (bandOnsets[band] ?? []).filter((time) => time >= sinceMs)).sort((a, b) => a - b)
  return times.filter((time, index) => index === 0 || time - (times[index - 1] ?? time) >= SAME_HIT_MS)
}

/**
 * The note value the snare is playing right now, read from its recent hits and the beat length, or null when it is not rolling
 * (fewer than three hits lately, or the last one is more than a beat old). The gap between the newest few hits is compared with the
 * beat: about 1 is quarter notes, a half eighths, a quarter sixteenths. Slower than quarters (a backbeat) never has the three hits
 * in the window, so it reads as null. It needs the tempo; without one there is nothing to measure against.
 */
export const rollLevel = (bandOnsets: ReadonlyArray<readonly number[]>, periodMs: number | null, nowMs: number): RollLevel | null => {
  if (periodMs === null || periodMs <= 0) return null
  const hits = recentHits(bandOnsets, ROLL_BANDS, nowMs - periodMs * WINDOW_BEATS)
  const last = hits[hits.length - 1]
  if (hits.length < MIN_HITS || last === undefined || nowMs - last > periodMs) return null
  const gaps = hits.slice(-(MAX_GAPS + 1)).map((time, index, recent) => time - (recent[index - 1] ?? time)).slice(1).sort((a, b) => a - b)
  // Even counts take the longer of the middle two: the slower reading is the safer one to call.
  const ratio = (gaps[Math.floor(gaps.length / 2)] ?? periodMs) / periodMs
  if (ratio > QUARTER_FLOOR) return 1
  if (ratio > EIGHTH_FLOOR) return 2
  return 3
}

/** The note value as its denominator, for showing: 4, 8 or 16. */
export const rollDenominator = (level: RollLevel): number => 2 ** (level + 1)
