import { DRUM_KINDS, type DrumKind, type FrameReading, type SectionLog, type SongSection } from 'beatsense'

import type { PlaybackSegment } from '../player/playbackLog'
import { isLabelKind, sortLabels, type Label } from './labels'

// The file a recorded lab session is saved to and the review page loads. Versioned: a reader takes only versions it knows and says so
// otherwise, and a change to the shape bumps `version` (with a reader for the old one, if old files are worth keeping).

export const SESSION_FORMAT = 'beatsense-lab-session'
export const SESSION_VERSION = 1

/** A drum hit the drum model called while recording, to score against the drum labels. */
export type DrumDetection = { kind: DrumKind; t: number }

/** What the lab's player played during a session: the file, how its sound reached the analysis, and every play, seek, loop and pause. */
export type SessionPlayback = {
  file: { name: string; durationMs: number; size: number }
  /** Out through the speakers and back in through the mic, or straight into the analysis. */
  mode: 'mic' | 'direct'
  /** On the session's clock, from the one in effect at the start to the last before the end. */
  segments: PlaybackSegment[]
}

export type LabSessionFile = {
  format: typeof SESSION_FORMAT
  version: typeof SESSION_VERSION
  /** When the recording stopped (ISO 8601). */
  recordedAt: string
  /** When the labels were last edited on the review page (ISO 8601), absent before. */
  editedAt?: string
  /** The audio context's sample rate, Hz. */
  sampleRate: number | null
  /** Audio clock, ms: when Record and Stop were pressed. */
  startMs: number
  endMs: number
  /** Every reading the AnalysisHost gave while recording, oldest first. */
  frames: FrameReading[]
  /** The drum model's hits while recording, oldest first. */
  drumHits: DrumDetection[]
  /** The labels, sorted by time. */
  labels: Label[]
  /** The section tracker's ticks while recording, replayable through a fresh tracker (beatsense's section log, version 2). */
  sectionLog: SectionLog
  /** With the lab's player playing a file, what it played: labels and frames then map onto the song by it. Absent otherwise. */
  playback?: SessionPlayback
}

const SECTIONS: readonly SongSection[] = ['intro', 'quiet', 'groove', 'buildup', 'turnaround', 'break', 'drop', 'outro']

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

const isNumberOrNull = (value: unknown): value is number | null => value === null || isFiniteNumber(value)

const isNumberArray = (value: unknown): value is number[] => Array.isArray(value) && value.every(isFiniteNumber)

const isFrame = (value: unknown): value is FrameReading =>
  isRecord(value)
  && isFiniteNumber(value.t)
  && isNumberArray(value.levels)
  && typeof value.beat === 'boolean'
  && isNumberOrNull(value.beatBand)
  && isNumberOrNull(value.bpm)
  && SECTIONS.includes(value.section as SongSection)
  && isFiniteNumber(value.riser)
  && isFiniteNumber(value.sweep)

const isDrumDetection = (value: unknown): value is DrumDetection =>
  isRecord(value) && isFiniteNumber(value.t) && (DRUM_KINDS as readonly string[]).includes(value.kind as string)

const isLabel = (value: unknown): value is Label =>
  isRecord(value) && Number.isInteger(value.id) && isFiniteNumber(value.t) && isLabelKind(value.kind)

const isSegment = (value: unknown): value is PlaybackSegment =>
  isRecord(value)
  && isFiniteNumber(value.atMs)
  && isNumberOrNull(value.songMs)
  && (value.loop === null || (isRecord(value.loop) && isFiniteNumber(value.loop.startMs) && isFiniteNumber(value.loop.endMs)))

const checkPlayback = (value: unknown): SessionPlayback | undefined => {
  if (value === undefined) return undefined
  const valid = isRecord(value)
    && isRecord(value.file)
    && typeof value.file.name === 'string'
    && isFiniteNumber(value.file.durationMs)
    && isFiniteNumber(value.file.size)
    && (value.mode === 'mic' || value.mode === 'direct')
    && Array.isArray(value.segments)
    && value.segments.every(isSegment)
  if (!valid) throw new Error('The session\'s playback is not valid.')
  return value as SessionPlayback
}

const isSectionLog = (value: unknown): value is SectionLog =>
  isRecord(value)
  && value.version === 2
  && isFiniteNumber(value.tickMs)
  && typeof value.savedAt === 'string'
  && Array.isArray(value.ticks)
  && value.ticks.every((tick) => isRecord(tick) && isFiniteNumber(tick.t) && isNumberArray(tick.power) && isFiniteNumber(tick.beats))

/** Where in a list the first bad entry is, for the message. */
const firstBad = (list: readonly unknown[], check: (value: unknown) => boolean): number => list.findIndex((value) => !check(value))

const checkList = <T>(data: Record<string, unknown>, key: string, check: (value: unknown) => value is T): T[] => {
  const list = data[key]
  if (!Array.isArray(list)) throw new Error(`The session has no ${key} list.`)
  const bad = firstBad(list, check)
  if (bad >= 0) throw new Error(`The session's ${key}[${bad}] is not valid.`)
  return list as T[]
}

/**
 * Reads a session file's text. Throws an Error that says what is wrong (not JSON, another file, a version this page does not know, a bad
 * entry), for the review page to show. Labels come back sorted by time.
 */
export const parseSessionFile = (text: string): LabSessionFile => checkSession(parseJson(text))

/** JSON.parse, with the review page's message for text that is not JSON. */
export const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('The file is not JSON.')
  }
}

/** A parsed session (a file's JSON, or a pass inside a song file), checked as parseSessionFile does. */
export const checkSession = (data: unknown): LabSessionFile => {
  if (!isRecord(data) || data.format !== SESSION_FORMAT) throw new Error('The file is not a beatsense lab session.')
  if (data.version !== SESSION_VERSION) {
    throw new Error(`The session is version ${String(data.version)}; this page reads version ${SESSION_VERSION}.`)
  }
  const { recordedAt, editedAt, sampleRate, startMs, endMs, sectionLog } = data
  if (typeof recordedAt !== 'string') throw new Error('The session has no recordedAt time.')
  if (editedAt !== undefined && typeof editedAt !== 'string') throw new Error('The session\'s editedAt is not a time.')
  if (!isNumberOrNull(sampleRate)) throw new Error('The session\'s sampleRate is not a number.')
  if (!isFiniteNumber(startMs) || !isFiniteNumber(endMs) || endMs < startMs) throw new Error('The session\'s start and end are not valid.')
  const frames = checkList(data, 'frames', isFrame)
  const drumHits = checkList(data, 'drumHits', isDrumDetection)
  const labels = checkList(data, 'labels', isLabel)
  if (new Set(labels.map(({ id }) => id)).size !== labels.length) throw new Error('Two of the session\'s labels share an id.')
  if (!isSectionLog(sectionLog)) throw new Error('The session\'s section log is not valid.')
  const playback = checkPlayback(data.playback)
  return {
    format: SESSION_FORMAT,
    version: SESSION_VERSION,
    recordedAt,
    ...(editedAt === undefined ? {} : { editedAt }),
    sampleRate,
    startMs,
    endMs,
    frames,
    drumHits,
    labels: sortLabels(labels),
    sectionLog,
    ...(playback ? { playback } : {}),
  }
}

/** The session with edited labels, stamped with the edit time, for a re-export. */
export const withLabels = (file: LabSessionFile, labels: readonly Label[], editedAt: Date = new Date()): LabSessionFile => ({
  ...file,
  editedAt: editedAt.toISOString(),
  labels: sortLabels(labels),
})

export const serializeSessionFile = (file: LabSessionFile): string => JSON.stringify(file)

const pad = (n: number): string => String(n).padStart(2, '0')

const stampOf = (date: Date): string => [date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds()]
  .map((part, i) => (i === 0 ? String(part) : pad(part)))
  .join('-')

/** A file name from the recording's local date and time, e.g. beatsense-session-2026-11-13-21-05-09.json. */
export const sessionFileName = (date: Date, suffix: string = ''): string => `beatsense-session-${stampOf(date)}${suffix}.json`

/** A track's file name without its extension, safe for a file system: the title of its songs and the start of its passes' names. */
export const trackTitle = (fileName: string): string =>
  fileName.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[^\w.-]+/g, '-').replace(/-{2,}/g, '-').replace(/^[-.]+|[-.]+$/g, '') || 'track'

/** A session's file name: after the track the player played, e.g. Artist-Song-2026-11-13-21-05-09.json, or sessionFileName without one. */
export const sessionFileNameFor = ({ playback, recordedAt }: LabSessionFile): string => {
  const date = new Date(recordedAt)
  return playback ? `${trackTitle(playback.file.name)}-${stampOf(date)}.json` : sessionFileName(date)
}

/** The name a re-export is saved under: the loaded file's, marked as labelled once (a second edit keeps the same name). */
export const editedFileName = (loadedName: string): string => {
  const base = loadedName.replace(/\.json$/i, '')
  return base.endsWith('-labelled') ? `${base}.json` : `${base}-labelled.json`
}
