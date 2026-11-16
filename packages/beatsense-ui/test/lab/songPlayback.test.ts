import type { FrameReading } from 'beatsense'
import { describe, expect, it } from 'vitest'

import type { PlaybackSegment } from '../../lab/player/playbackLog'
import { isSureAlignment } from '../../lab/recording/align'
import { moveLabel } from '../../lab/recording/labelEdits'
import { parseSessionFile, serializeSessionFile, sessionFileNameFor, trackTitle, type LabSessionFile, type SessionPlayback } from '../../lab/recording/sessionFile'
import { SessionRecorder } from '../../lab/recording/sessionRecorder'
import {
  addPass, labelBounds, passBounds, passSlices, placePass, samePlayback, songFrames, songFromSession, songLabels, songOrigin, toSongTime,
} from '../../lab/recording/songFile'
import { FRAME_MS, passOf, syntheticReadings, syntheticSongLevels } from './syntheticFrames'

const FILE = { name: 'track.flac', durationMs: 240000, size: 123456 }

/** A session on clock 0 to 6 s with the given playback and labels, frames every frame. */
const played = (segments: PlaybackSegment[], labels: Array<[number]>, mode: SessionPlayback['mode'] = 'mic'): LabSessionFile => {
  const recorder = new SessionRecorder()
  recorder.start(0)
  syntheticReadings(361).forEach((reading) => recorder.addFrame(reading))
  labels.forEach(([t]) => recorder.addLabel('kick', t))
  recorder.stop(6000)
  return recorder.toFile({ sectionTicks: [], sampleRate: 48000, playback: { file: FILE, mode, segments } })!
}

// Played from 1:00 at t = 0, seeked back to 0:58 at t = 2000, paused at t = 4000, played on at t = 5000 from 1:00.
const SEEKED: PlaybackSegment[] = [
  { atMs: 0, songMs: 60000, loop: null },
  { atMs: 2000, songMs: 58000, loop: null },
  { atMs: 4000, songMs: null, loop: null },
  { atMs: 5000, songMs: 60000, loop: null },
]

describe('a pass played through the lab\'s player', () => {
  it('keeps its playback through the file', () => {
    const session = played(SEEKED, [])
    expect(parseSessionFile(serializeSessionFile(session)).playback).toEqual({ file: FILE, mode: 'mic', segments: SEEKED })
    const broken = { ...JSON.parse(serializeSessionFile(session)), playback: { file: FILE, mode: 'radio', segments: [] } }
    expect(() => parseSessionFile(JSON.stringify(broken))).toThrow('playback')
  })

  it('maps labels onto the song by its log, leaving out one made while paused', () => {
    const song = songFromSession(played(SEEKED, [[500], [2500], [4500], [5200]]), 'pass.json')
    expect(songOrigin(song)).toBe(0)
    expect(songLabels(song).map(({ t, passT }) => [t, passT])).toEqual([[58500, 2500], [60200, 5200], [60500, 500]])
  })

  it('adds the pass\'s correction to every slice', () => {
    const pass = { name: 'p', offsetMs: 40, alignment: null, session: played(SEEKED, []) }
    expect(passSlices(pass).map(({ offsetMs }) => offsetMs)).toEqual([60040, 56040, 55040])
    expect(toSongTime(passSlices(pass), 4500)).toBeNull()
    expect(passBounds(pass)).toEqual({ startMs: 58040, endMs: 62039 })
  })

  it('keeps one frame per song moment where the pass played a stretch twice', () => {
    const { frames } = songFrames({ name: 'p', offsetMs: 0, alignment: null, session: played(SEEKED, []) })
    // 58 s to 60 s once (the seek back), 60 s to 62 s once though it played twice (before the seek and after the pause).
    for (let i = 1; i < frames.length; i++) expect(frames[i]!.t - frames[i - 1]!.t).toBeGreaterThan(FRAME_MS / 2)
    expect(frames[0]!.t).toBeCloseTo(58000, 0)
    expect(frames[frames.length - 1]!.t).toBeLessThan(62000)
  })

  it('maps each turn of a loop onto the same stretch of the song', () => {
    const looped = played([{ atMs: 0, songMs: 30000, loop: { startMs: 30000, endMs: 32000 } }], [[100], [2100], [4100]])
    const labels = songLabels(songFromSession(looped, 'loop.json'))
    expect(labels.map(({ t }) => t)).toEqual([30100, 30100, 30100])
  })

  it('keeps a moved label inside its slice, so a move cannot carry it over a wrap or a seek', () => {
    const pass = { name: 'p', offsetMs: 0, alignment: null, session: played([{ atMs: 0, songMs: 30000, loop: { startMs: 30000, endMs: 32000 } }], [[100], [2100], [4100]]) }
    expect(labelBounds(pass, 2100)).toEqual({ startMs: 2000, endMs: 3999 })
    expect(labelBounds(pass, 4100)).toEqual({ startMs: 4000, endMs: 5999 })
    // The label at 2100 (song 30.1 s, the second turn) dragged 2.5 s later stops at the end of its turn, not on the next turn's 30.6 s.
    const moved = moveLabel(pass.session.labels, 2, 2100 + 2500, labelBounds(pass, 2100))
    const song = songFromSession({ ...pass.session, labels: moved }, 'loop.json')
    expect(songLabels(song).map(({ t }) => t)).toEqual([30100, 30100, 31999])
    // A time in no slice (paused) has the whole session.
    const seeked = { name: 'p', offsetMs: 0, alignment: null, session: played(SEEKED, []) }
    expect(labelBounds(seeked, 4500)).toEqual({ startMs: 0, endMs: 6000 })
    expect(labelBounds(seeked, 1000)).toEqual({ startMs: 0, endMs: 1999 })
  })

  it('knows two passes of the same file', () => {
    expect(samePlayback(played(SEEKED, []), played([{ atMs: 0, songMs: 0, loop: null }], [], 'direct'))).toBe(true)
    const other = played(SEEKED, [])
    other.playback = { ...other.playback!, file: { ...FILE, name: 'other.flac' } }
    expect(samePlayback(played(SEEKED, []), other)).toBe(false)
  })
})

const SONG = syntheticSongLevels(120, 7)

/** A session of the given frames, from the first frame's time to the last, optionally played through the player. */
const sessionOf = (frames: FrameReading[], labels: number[] = [], playback?: SessionPlayback): LabSessionFile => {
  const recorder = new SessionRecorder()
  recorder.start(frames[0]!.t)
  frames.forEach((frame) => recorder.addFrame(frame))
  labels.forEach((t) => recorder.addLabel('kick', t))
  recorder.stop(frames[frames.length - 1]!.t)
  return recorder.toFile({ sectionTicks: [], sampleRate: 48000, ...(playback ? { playback } : {}) })!
}

describe('placing a pass on the song', () => {
  // The first pass heard the song from its start, with no player, on a clock where it began at 5 s: its song time is that clock.
  const first = { name: 'first.json', offsetMs: 0, alignment: null, session: sessionOf(passOf(SONG, 0, 60 * 90, { clockMs: 5000 })) }
  // The second played the track through the player from song frame 1404 (23.4 s into the file), on a clock that started elsewhere.
  const clockMs = 987654.3
  const songStartMs = 1404 * FRAME_MS

  it('matches a played pass on its song time, so its offset is not counted twice', () => {
    const frames = passOf(SONG, 1404, 1404 + 60 * 40, { clockMs, gain: 0.5, noise: 0.2, seed: 3 })
    const session = sessionOf(frames, [clockMs + 1000], { file: FILE, mode: 'mic', segments: [{ atMs: clockMs, songMs: songStartMs, loop: null }] })
    const placed = placePass(first, session)
    // The file's start was heard at 5 s on the first pass's clock: that is all the offset adds to the player's mapping.
    expect(Math.abs(placed.offsetMs - 5000)).toBeLessThan(5)
    expect(placed.alignment).not.toBeNull()
    const song = addPass(songFromSession(first.session, 'first.json'), { name: 'second.json', ...placed, session })
    // The label a second into the pass is song frame 1464, which the first pass heard at 5000 + 1464 frames.
    const [label] = songLabels(song, new Set([1]))
    expect(Math.abs(label!.t - (5000 + 1464 * FRAME_MS))).toBeLessThan(5)
  })

  it('lines a played pass up start to start on song time when nothing matches', () => {
    const silent = passOf(SONG, 1404, 1404 + 600, { clockMs, gain: 0 })
    const session = sessionOf(silent, [], { file: FILE, mode: 'mic', segments: [{ atMs: clockMs, songMs: songStartMs, loop: null }] })
    const placed = placePass(first, session)
    expect(placed.alignment).toBeNull()
    expect(placed.offsetMs).toBeCloseTo(5000 - songStartMs)
    const song = addPass(songFromSession(first.session, 'first.json'), { name: 'silent.json', ...placed, session })
    expect(passBounds(song.passes[1]!).startMs).toBeCloseTo(5000)
  })

  it('finds only the small correction between two passes of the same file, and says how sure it is', () => {
    const played0 = sessionOf(passOf(SONG, 0, 60 * 60, { clockMs: 0 }), [], { file: FILE, mode: 'direct', segments: [{ atMs: 0, songMs: 0, loop: null }] })
    const reference = { name: 'a.json', offsetMs: 0, alignment: null, session: played0 }
    // Through the mic, three frames (50 ms) late: what it heard at its clock's 50 s was the file's 30 s minus 50 ms.
    const late = sessionOf(passOf(SONG, 1797, 1797 + 600, { clockMs: 50000, noise: 0.1, seed: 9 }), [], {
      file: FILE, mode: 'mic', segments: [{ atMs: 50000, songMs: 1800 * FRAME_MS, loop: null }],
    })
    const placed = placePass(reference, late)
    expect(Math.abs(placed.offsetMs - -3 * FRAME_MS)).toBeLessThan(5)
    // The runner-up comes from the narrow search itself, not "none found".
    expect(placed.alignment!.runnerUp).toBeGreaterThan(-1)
    expect(isSureAlignment(placed.alignment!)).toBe(true)
  })
})

describe('names after the track', () => {
  it('names a pass and its song after the track played', () => {
    const session = played(SEEKED, [])
    session.playback = { ...session.playback!, file: { ...FILE, name: 'Artist - Song (Extended Mix).flac' } }
    session.recordedAt = new Date(2026, 10, 14, 9, 5, 7).toISOString()
    expect(sessionFileNameFor(session)).toBe('Artist-Song-Extended-Mix-2026-11-14-09-05-07.json')
    expect(songFromSession(session, 'whatever.json').title).toBe('Artist-Song-Extended-Mix')
    expect(trackTitle('..mp3')).toBe('track')
  })
})
