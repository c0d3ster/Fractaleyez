import { describe, expect, it } from 'vitest'

import type { PlaybackSegment } from '../../lab/player/playbackLog'
import { parseSessionFile, serializeSessionFile, sessionFileNameFor, trackTitle, type LabSessionFile, type SessionPlayback } from '../../lab/recording/sessionFile'
import { SessionRecorder } from '../../lab/recording/sessionRecorder'
import { passBounds, samePlayback, songFrames, songFromSession, songLabels, songOrigin, toSongTime, passSlices } from '../../lab/recording/songFile'
import { FRAME_MS, syntheticReadings } from './syntheticFrames'

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

  it('knows two passes of the same file', () => {
    expect(samePlayback(played(SEEKED, []), played([{ atMs: 0, songMs: 0, loop: null }], [], 'direct'))).toBe(true)
    const other = played(SEEKED, [])
    other.playback = { ...other.playback!, file: { ...FILE, name: 'other.flac' } }
    expect(samePlayback(played(SEEKED, []), other)).toBe(false)
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
