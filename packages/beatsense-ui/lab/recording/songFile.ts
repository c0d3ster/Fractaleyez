import type { FrameReading } from 'beatsense'

import { sliceLog, type PlaybackSlice } from '../player/playbackLog'
import { sortLabels, type Label } from './labels'
import type { TimeBounds } from './labelEdits'
import { checkSession, parseJson, trackTitle, type DrumDetection, type LabSessionFile } from './sessionFile'

// A song labelled over several passes: each pass is a session as the lab exported it (its frames, the model's output and its labels, on
// its own audio clock) plus what puts it on the song's time. A pass the lab's player played maps through its playback log: song time is
// the position in the file, slice by slice (between seeks, per turn of a loop), with the pass's offset as a small correction (the trip
// from the speakers to the mic). A pass without one maps by its offset alone onto the first pass's clock. Labels stay in their pass, so a pass's
// frames and labels can still train together; the review page shows every pass's labels on the one song timeline.

export const SONG_FORMAT = 'beatsense-lab-song'
export const SONG_VERSION = 1

export type PassAlignment = {
  /** How well the pass's onsets matched the first pass's at its offset (-1 to 1), and at the best other offset a second or more away. */
  score: number
  runnerUp: number
}

export type SongPass = {
  /** The session's file name, to tell passes apart. */
  name: string
  /**
   * Without a playback log, song time = the pass's audio clock + offsetMs (0 for the first pass). With one, it is added to the log's
   * mapping as a correction: the delay from the player's position to what the mic heard, as measured.
   */
  offsetMs: number
  /** How it was aligned: the match found, or null when the offset was set by hand (or it is the first pass). */
  alignment: PassAlignment | null
  session: LabSessionFile
}

export type LabSongFile = {
  format: typeof SONG_FORMAT
  version: typeof SONG_VERSION
  title: string
  savedAt: string
  passes: SongPass[]
}

/**
 * A label shown on the song timeline (t is song time): its pass, its own time on the pass's clock, and an id unique across passes
 * (passIndex * PASS_ID_STRIDE + the label's id).
 */
export type SongLabel = Label & { passIndex: number; labelId: number; passT: number }

/** Spacing of the view ids: a pass holds fewer labels than this. */
export const PASS_ID_STRIDE = 1_000_000

export const viewId = (passIndex: number, labelId: number): number => passIndex * PASS_ID_STRIDE + labelId

export const fromViewId = (id: number): { passIndex: number; labelId: number } => ({
  passIndex: Math.floor(id / PASS_ID_STRIDE),
  labelId: id % PASS_ID_STRIDE,
})

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

const checkAlignment = (value: unknown, index: number): PassAlignment | null => {
  if (value === null || value === undefined) return null
  if (isRecord(value) && typeof value.score === 'number' && typeof value.runnerUp === 'number') return { score: value.score, runnerUp: value.runnerUp }
  throw new Error(`The song's pass ${index + 1} has a bad alignment.`)
}

const checkPass = (value: unknown, index: number): SongPass => {
  if (!isRecord(value)) throw new Error(`The song's pass ${index + 1} is not valid.`)
  const { name, offsetMs, alignment, session } = value
  if (typeof name !== 'string' || typeof offsetMs !== 'number' || !Number.isFinite(offsetMs)) {
    throw new Error(`The song's pass ${index + 1} has no name or offset.`)
  }
  try {
    return { name, offsetMs, alignment: checkAlignment(alignment, index), session: checkSession(session) }
  } catch (err) {
    throw new Error(`The song's pass ${index + 1}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/** Reads a song file's text; throws an Error that says what is wrong. */
export const parseSongFile = (text: string): LabSongFile => {
  const data = parseJson(text)
  if (!isRecord(data) || data.format !== SONG_FORMAT) throw new Error('The file is not a beatsense lab song.')
  if (data.version !== SONG_VERSION) throw new Error(`The song is version ${String(data.version)}; this page reads version ${SONG_VERSION}.`)
  if (typeof data.title !== 'string' || typeof data.savedAt !== 'string') throw new Error('The song has no title or save time.')
  if (!Array.isArray(data.passes) || data.passes.length === 0) throw new Error('The song has no passes.')
  return { format: SONG_FORMAT, version: SONG_VERSION, title: data.title, savedAt: data.savedAt, passes: data.passes.map(checkPass) }
}

/** What a dropped or opened file is: a song, or a session (which becomes a song of one pass). */
export const parseLabFile = (text: string, name: string): LabSongFile => {
  const data = parseJson(text)
  if (isRecord(data) && data.format === SONG_FORMAT) return parseSongFile(text)
  return songFromSession(checkSession(data), name)
}

/** A song of one pass. The title is the track the player played, or else the session's file name without its extension. */
export const songFromSession = (session: LabSessionFile, name: string, savedAt: Date = new Date()): LabSongFile => ({
  format: SONG_FORMAT,
  version: SONG_VERSION,
  title: session.playback ? trackTitle(session.playback.file.name) : name.replace(/\.json$/i, '').replace(/-labelled$/, ''),
  savedAt: savedAt.toISOString(),
  passes: [{ name, offsetMs: 0, alignment: null, session }],
})

export const addPass = (song: LabSongFile, pass: SongPass): LabSongFile => ({ ...song, passes: [...song.passes, pass] })

export const removePass = (song: LabSongFile, passIndex: number): LabSongFile =>
  passIndex === 0 || song.passes.length <= 1 ? song : { ...song, passes: song.passes.filter((_, i) => i !== passIndex) }

/** The song with one pass's offset changed (a nudge by hand clears its alignment score, which no longer describes it). */
export const setPassOffset = (song: LabSongFile, passIndex: number, offsetMs: number, alignment: PassAlignment | null = null): LabSongFile => ({
  ...song,
  passes: song.passes.map((pass, i) => (i === passIndex ? { ...pass, offsetMs, alignment } : pass)),
})

/** The song with one pass's labels replaced (on the pass's own clock), stamped as edited. */
export const setPassLabels = (song: LabSongFile, passIndex: number, labels: readonly Label[], editedAt: Date = new Date()): LabSongFile => ({
  ...song,
  passes: song.passes.map((pass, i) => (i === passIndex
    ? { ...pass, session: { ...pass.session, editedAt: editedAt.toISOString(), labels: sortLabels(labels) } }
    : pass)),
})

/** A pass's slices: its playback log's (with the correction added), or the whole pass at its offset. */
export const passSlices = ({ offsetMs, session }: SongPass): PlaybackSlice[] => {
  const { startMs, endMs, playback } = session
  // The end is included: a slice covers [fromMs, toMs), and the last frame sits on endMs.
  if (!playback) return [{ fromMs: startMs, toMs: endMs + 1, offsetMs }]
  return sliceLog(playback.segments, startMs, endMs + 1).map((slice) => ({ ...slice, offsetMs: slice.offsetMs + offsetMs }))
}

/** A time on the pass's clock in song time, or null when the song was not playing then (paused, stopped). */
export const toSongTime = (slices: readonly PlaybackSlice[], t: number): number | null => {
  const slice = slices.find(({ fromMs, toMs }) => t >= fromMs && t < toMs)
  return slice ? t + slice.offsetMs : null
}

/** Every label of the passes shown, on song time, sorted. A label made while the song was paused is left out. */
export const songLabels = (song: LabSongFile, shown: ReadonlySet<number> | null = null): SongLabel[] =>
  sortLabels(song.passes.flatMap((pass, passIndex) => {
    if (shown && !shown.has(passIndex)) return []
    const slices = passSlices(pass)
    return pass.session.labels.flatMap((label): SongLabel[] => {
      const t = toSongTime(slices, label.t)
      return t === null ? [] : [{ ...label, id: viewId(passIndex, label.id), t, passIndex, labelId: label.id, passT: label.t }]
    })
  }))

/** A pass's span on song time. */
export const passBounds = (pass: SongPass): TimeBounds => {
  const slices = passSlices(pass)
  if (slices.length === 0) return { startMs: 0, endMs: 0 }
  return {
    startMs: Math.min(...slices.map(({ fromMs, offsetMs }) => fromMs + offsetMs)),
    endMs: Math.max(...slices.map(({ toMs, offsetMs }) => toMs - 1 + offsetMs)),
  }
}

/**
 * A pass's frames and drum hits on song time, sorted, for drawing and aligning. Where a pass covered the same stretch twice (a loop, a
 * seek back), the first time is kept, so the frames stay one per moment.
 */
export const songFrames = (pass: SongPass): { frames: FrameReading[]; drumHits: DrumDetection[] } => {
  const slices = passSlices(pass)
  const covered: Array<[number, number]> = []
  const frames: FrameReading[] = []
  slices.forEach(({ fromMs, toMs, offsetMs }) => {
    const from = fromMs + offsetMs
    const to = toMs + offsetMs
    const seen = covered.filter(([a, b]) => a < to && b > from)
    pass.session.frames.forEach((frame) => {
      if (frame.t < fromMs || frame.t >= toMs) return
      const t = frame.t + offsetMs
      if (seen.some(([a, b]) => t >= a && t < b)) return
      frames.push({ ...frame, t })
    })
    covered.push([from, to])
  })
  frames.sort((a, b) => a.t - b.t)
  const drumHits = pass.session.drumHits
    .flatMap((hit) => {
      const t = toSongTime(slices, hit.t)
      return t === null ? [] : [{ ...hit, t }]
    })
    .sort((a, b) => a.t - b.t)
  return { frames, drumHits }
}

/** Where the song's time starts on screen: the file's start when the first pass played through the lab's player, else the first pass's start. */
export const songOrigin = (song: LabSongFile): number => passOrigin(song.passes[0]!)

/** The same for a song whose first pass is `first`. */
export const passOrigin = (first: SongPass): number => (first.session.playback ? 0 : passBounds(first).startMs)

/** How far to look around the player's mapping for the trip from the speakers to the mic (and any difference in it between passes). */
export const PLAYBACK_CORRECTION_MS = 300

/** The overlap that correction needs: a few seconds, since a search that narrow cannot land on the wrong bar. */
export const PLAYBACK_MIN_OVERLAP_MS = 3000

/** Whether two passes played the same file through the lab's player (so their logs share song time and need only a small correction). */
export const samePlayback = (a: LabSessionFile, b: LabSessionFile): boolean =>
  Boolean(a.playback && b.playback && a.playback.file.name === b.playback.file.name && Math.abs(a.playback.file.durationMs - b.playback.file.durationMs) < 50)

/** Song time covered by any pass. */
export const songBounds = (song: LabSongFile): TimeBounds => {
  const spans = song.passes.map(passBounds)
  return { startMs: Math.min(...spans.map(({ startMs }) => startMs)), endMs: Math.max(...spans.map(({ endMs }) => endMs)) }
}

export const serializeSongFile = (song: LabSongFile, savedAt: Date = new Date()): string => JSON.stringify({ ...song, savedAt: savedAt.toISOString() })

/** The song file's name: its title, safe for a file system. */
export const songFileName = (title: string): string => `${title.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'song'}.song.json`
