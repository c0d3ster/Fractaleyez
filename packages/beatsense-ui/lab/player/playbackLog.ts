// What the lab's player did, on the analysis clock (the capture frames' ms): each time playback starts, seeks, starts a loop or pauses, a
// segment from that moment on. From it, any frame or label time maps onto the song (ms from the start of the file), and a pass splits into
// slices that each have one offset: the stretch between two changes, or one turn of a loop.

export type PlaybackLoop = { startMs: number; endMs: number }

export type PlaybackSegment = {
  /** When it took effect, analysis clock ms. */
  atMs: number
  /** The song position at that moment (ms from the file's start), or null for a pause. */
  songMs: number | null
  /** A loop playing from here: on reaching endMs the song goes back to startMs. */
  loop: PlaybackLoop | null
}

/** A stretch of a pass with one mapping: song time = t + offsetMs, for t in [fromMs, toMs). */
export type PlaybackSlice = { fromMs: number; toMs: number; offsetMs: number }

/** The song position at `t` under one segment (it must have started by then and be playing). */
const positionIn = ({ atMs, songMs, loop }: PlaybackSegment, t: number): number | null => {
  if (songMs === null) return null
  const position = songMs + (t - atMs)
  if (!loop || position < loop.endMs) return position
  const length = loop.endMs - loop.startMs
  return length > 0 ? loop.startMs + ((position - loop.startMs) % length) : loop.startMs
}

/** The segment in effect at `t` (the last to start at or before it), or null before the first. */
export const segmentAt = (segments: readonly PlaybackSegment[], t: number): PlaybackSegment | null => {
  let found: PlaybackSegment | null = null
  for (const segment of segments) {
    if (segment.atMs > t) break
    found = segment
  }
  return found
}

/** The song position at analysis time `t`, or null while paused, stopped or before playback began. */
export const songTimeAt = (segments: readonly PlaybackSegment[], t: number): number | null => {
  const segment = segmentAt(segments, t)
  return segment ? positionIn(segment, t) : null
}

/**
 * The slices of [fromMs, toMs): one per stretch between changes, a loop's stretch cut at each wrap. Paused stretches have no slice (their
 * frames are not in the song).
 */
export const sliceLog = (segments: readonly PlaybackSegment[], fromMs: number, toMs: number): PlaybackSlice[] => {
  const slices: PlaybackSlice[] = []
  const push = (from: number, to: number, offsetMs: number): void => {
    if (to > from) slices.push({ fromMs: from, toMs: to, offsetMs })
  }
  segments.forEach((segment, i) => {
    const { atMs, songMs, loop } = segment
    const segmentEnd = Math.min(toMs, segments[i + 1]?.atMs ?? Infinity)
    const from = Math.max(fromMs, atMs)
    if (songMs === null || segmentEnd <= from) return
    if (!loop || loop.endMs <= loop.startMs) {
      push(from, segmentEnd, songMs - atMs)
      return
    }
    // Before the first wrap: from the segment's start position up to loop end; then one slice per turn.
    let turnStart = atMs
    let turnSong = songMs
    while (turnStart < segmentEnd) {
      const turnEnd = turnStart + Math.max(0, loop.endMs - turnSong)
      push(Math.max(from, turnStart), Math.min(segmentEnd, turnEnd), turnSong - turnStart)
      if (turnEnd <= turnStart) break
      turnStart = turnEnd
      turnSong = loop.startMs
    }
  })
  return slices
}

/** The log as a list, appended to as the player changes; trimmed to what a recording needs when one is made into a file. */
export class PlaybackLog {
  private readonly log: PlaybackSegment[] = []

  record = (segment: PlaybackSegment): void => {
    // A change at the same moment as the last replaces it (a seek right after a play), keeping the times in order.
    const last = this.log[this.log.length - 1]
    if (last && segment.atMs <= last.atMs) this.log.pop()
    this.log.push(segment)
  }

  segments = (): readonly PlaybackSegment[] => this.log

  songTimeAt = (t: number): number | null => songTimeAt(this.log, t)

  /** The segments covering [fromMs, toMs]: the one in effect at fromMs and every one after it up to toMs. */
  between = (fromMs: number, toMs: number): PlaybackSegment[] => {
    const first = this.log.findIndex((_, i) => (this.log[i + 1]?.atMs ?? Infinity) > fromMs)
    if (first < 0) return []
    return this.log.slice(first).filter(({ atMs }, i) => i === 0 || atMs <= toMs)
  }
}
