/** The note value the drums are rolling at: 4 is quarter notes, 8 eighths, 16 sixteenths (or faster). Read from the snare's and the clap's hits (beatsense's DrumHits). */
export type RollLevel = 4 | 8 | 16

// A snare and a clap layered on the same step are one hit. Sixteenths at 150 BPM are 100 ms apart, so this stays under half of that.
const SAME_HIT_MS = 45
// Hits older than this many beats are not what the drums are doing now. Long enough that quarter notes always have four hits in it, so one
// missed hit still leaves the middle gap at a beat (at 2.5 they only had three for half of each beat, and the kick used to fill the rest in).
// A backbeat has at most three, two beats apart, which HALF_FLOOR reads as no roll.
const WINDOW_BEATS = 4.5
// Fewest hits that say anything about a rate (two gaps), and the most gaps looked at, so a change of rate shows once most of the newest gaps are at it.
const MIN_HITS = 3
const MAX_GAPS = 3
// Where one note value ends and the next starts: halfway between them in the ratio of gap to beat (geometric, since each is half the one before).
// Gaps over HALF_FLOOR are half notes or slower (a backbeat with one fill hit in it), not a roll.
const HALF_FLOOR = Math.SQRT2
const QUARTER_FLOOR = Math.SQRT1_2
const EIGHTH_FLOOR = Math.SQRT1_2 / 2
// The hold (RollReader): a new note value shows once it has been read for this share of a beat, and the shown one stays until it has gone
// unread for this many beats, so a stray hit or a skipped one does not flash it away or swap it.
const ENTER_BEATS = 0.5
const LEAVE_BEATS = 1
// How often `tick` reads (ms). Each read copies the recent hits and sorts them: about 5 us, so every frame at 240 Hz was about
// 1.3 ms a second of main thread plus the garbage. The hold works in half beats (234 ms at 128 BPM), so 20 reads a second change nothing seen.
const READ_EVERY_MS = 50

/** The hits of every list (the snare's and the clap's) within `sinceMs`, oldest first, with a hit in two lists at once counted once. */
const recentHits = (hitLists: ReadonlyArray<readonly number[]>, sinceMs: number): number[] => {
  const times = hitLists.flatMap((list) => list.filter((time) => time >= sinceMs)).sort((a, b) => a - b)
  return times.filter((time, index) => index === 0 || time - (times[index - 1] ?? time) >= SAME_HIT_MS)
}

/**
 * The note value the snare is playing right now, read from its recent hits and the beat length, or null when it is not rolling
 * (fewer than three hits lately, or the last one is more than a beat old). The gap between the newest few hits is compared with the
 * beat: about 1 is quarter notes, a half eighths, a quarter (or less) sixteenths. Slower than quarters (a backbeat, two beats apart) reads
 * as null. It needs the tempo; without one there is nothing to measure against.
 */
export const rollLevel = (hitLists: ReadonlyArray<readonly number[]>, periodMs: number | null, nowMs: number): RollLevel | null => {
  if (periodMs === null || periodMs <= 0) return null
  const hits = recentHits(hitLists, nowMs - periodMs * WINDOW_BEATS)
  const last = hits[hits.length - 1]
  if (hits.length < MIN_HITS || last === undefined || nowMs - last > periodMs) return null
  const gaps = hits.slice(-(MAX_GAPS + 1)).map((time, index, recent) => time - (recent[index - 1] ?? time)).slice(1).sort((a, b) => a - b)
  // Even counts take the longer of the middle two: the slower reading is the safer one to call.
  const ratio = (gaps[Math.floor(gaps.length / 2)] ?? periodMs) / periodMs
  if (ratio > HALF_FLOOR) return null
  if (ratio > QUARTER_FLOOR) return 4
  return ratio > EIGHTH_FLOOR ? 8 : 16
}

/**
 * The roll as it is shown and steered by: `rollLevel` read every frame, held so it does not flicker (see ENTER_BEATS and LEAVE_BEATS).
 */
export class RollReader {
  private shown: RollLevel | null = null
  private lastSeenMs = Number.NEGATIVE_INFINITY
  private candidate: RollLevel | null = null
  private candidateSinceMs = 0
  private candidateLastMs = 0
  private lastReadMs = Number.NEGATIVE_INFINITY

  /** The held note value. The raw reading drops out for a frame now and then, so a short gap neither resets a value on its way in nor clears the shown one. */
  read = (hitLists: ReadonlyArray<readonly number[]>, periodMs: number | null, nowMs: number): RollLevel | null => {
    if (periodMs === null || periodMs <= 0) return this.reset()
    const level = rollLevel(hitLists, periodMs, nowMs)
    const enterMs = periodMs * ENTER_BEATS
    if (level !== null) {
      if (level === this.shown) {
        this.lastSeenMs = nowMs
        this.candidate = null
        return this.shown
      }
      if (level !== this.candidate || nowMs - this.candidateLastMs > enterMs) {
        this.candidate = level
        this.candidateSinceMs = nowMs
      }
      this.candidateLastMs = nowMs
      if (nowMs - this.candidateSinceMs >= enterMs) {
        this.shown = level
        this.lastSeenMs = nowMs
        this.candidate = null
        return this.shown
      }
    }
    if (this.shown !== null && nowMs - this.lastSeenMs > periodMs * LEAVE_BEATS) this.shown = null
    return this.shown
  }

  /**
   * `read`, at most every READ_EVERY_MS; between reads the held value. Safe to call every frame: the hits are only fetched when a read is due.
   */
  tick = (hits: () => ReadonlyArray<readonly number[]>, periodMs: number | null, nowMs: number): RollLevel | null => {
    if (nowMs - this.lastReadMs < READ_EVERY_MS) return this.shown
    this.lastReadMs = nowMs
    return this.read(hits(), periodMs, nowMs)
  }

  /** What `read` last returned, for showing it without reading again. */
  current = (): RollLevel | null => this.shown

  reset = (): null => {
    this.shown = null
    this.lastSeenMs = Number.NEGATIVE_INFINITY
    this.candidate = null
    this.lastReadMs = Number.NEGATIVE_INFINITY
    return null
  }
}
