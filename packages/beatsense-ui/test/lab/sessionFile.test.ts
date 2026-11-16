import { AnalysisHost, SectionTracker, loadSectionModel, type FrameReading } from 'beatsense'
import { describe, expect, it } from 'vitest'

import { editedFileName, parseSessionFile, serializeSessionFile, sessionFileName, withLabels, type LabSessionFile } from '../../lab/recording/sessionFile'
import { SessionRecorder } from '../../lab/recording/sessionRecorder'
import { syntheticCaptureFrames, syntheticReadings } from './syntheticFrames'

const smallFile = (): LabSessionFile => {
  const recorder = new SessionRecorder()
  recorder.start(0)
  syntheticReadings(90).forEach((reading) => recorder.addFrame(reading))
  recorder.addLabel('clap', 700)
  recorder.addLabel('riserStart', 100)
  recorder.stop(1500)
  return recorder.toFile({ sectionTicks: [{ t: 50, power: [1, 2, 3, 4, 5], beats: 1, bpm: null }], sampleRate: 44100 })!
}

const withField = (file: LabSessionFile, patch: Record<string, unknown>): string => JSON.stringify({ ...file, ...patch })

describe('session file', () => {
  it('round-trips through its text', () => {
    const file = smallFile()
    expect(parseSessionFile(serializeSessionFile(file))).toEqual(file)
  })

  it('says what is wrong with a file it cannot read', () => {
    const file = smallFile()
    expect(() => parseSessionFile('{')).toThrow('not JSON')
    expect(() => parseSessionFile('{"version":2}')).toThrow('not a beatsense lab session')
    expect(() => parseSessionFile(withField(file, { version: 2 }))).toThrow('version 2; this page reads version 1')
    expect(() => parseSessionFile(withField(file, { frames: 'x' }))).toThrow('no frames list')
    expect(() => parseSessionFile(withField(file, { frames: [file.frames[0], { t: 'soon' }] }))).toThrow('frames[1] is not valid')
    expect(() => parseSessionFile(withField(file, { labels: [{ id: 1, kind: 'cowbell', t: 5 }] }))).toThrow('labels[0] is not valid')
    expect(() => parseSessionFile(withField(file, { labels: [{ id: 1, kind: 'kick', t: 5 }, { id: 1, kind: 'hat', t: 6 }] }))).toThrow('share an id')
    expect(() => parseSessionFile(withField(file, { drumHits: [{ kind: 'tom', t: 3 }] }))).toThrow('drumHits[0] is not valid')
    expect(() => parseSessionFile(withField(file, { sectionLog: { version: 1, ticks: [] } }))).toThrow('section log')
    expect(() => parseSessionFile(withField(file, { startMs: 10, endMs: 5 }))).toThrow('start and end')
  })

  it('takes a section tick\'s BPM as a number, null or absent, and nothing else', () => {
    const file = smallFile()
    const withTick = (bpm: unknown): string => withField(file, { sectionLog: { ...file.sectionLog, ticks: [{ t: 50, power: [1, 2, 3, 4, 5], beats: 1, bpm }] } })
    expect(parseSessionFile(withTick(128)).sectionLog.ticks[0]!.bpm).toBe(128)
    expect(parseSessionFile(withTick(null)).sectionLog.ticks[0]!.bpm).toBeNull()
    expect(parseSessionFile(withTick(undefined)).sectionLog.ticks[0]!.bpm).toBeUndefined()
    expect(() => parseSessionFile(withTick({}))).toThrow('section log')
    expect(() => parseSessionFile(withTick('120'))).toThrow('section log')
  })

  it('sorts labels on read', () => {
    const file = smallFile()
    const text = withField(file, { labels: [{ id: 2, kind: 'kick', t: 900 }, { id: 1, kind: 'hat', t: 300 }] })
    expect(parseSessionFile(text).labels.map(({ id }) => id)).toEqual([1, 2])
  })

  it('re-exports with edited labels and an edit time, keeping the rest', () => {
    const file = smallFile()
    const edited = withLabels(file, [{ id: 2, kind: 'clap', t: 650 }], new Date('2026-11-14T10:00:00Z'))
    expect(edited.editedAt).toBe('2026-11-14T10:00:00.000Z')
    expect(edited.labels).toEqual([{ id: 2, kind: 'clap', t: 650 }])
    expect(edited.frames).toBe(file.frames)
    expect(parseSessionFile(serializeSessionFile(edited))).toEqual(edited)
  })

  it('names the file from the local date and time', () => {
    expect(sessionFileName(new Date(2026, 10, 3, 9, 5, 7))).toBe('beatsense-session-2026-11-03-09-05-07.json')
    expect(sessionFileName(new Date(2026, 10, 3, 9, 5, 7), '-labelled')).toBe('beatsense-session-2026-11-03-09-05-07-labelled.json')
  })
})

describe('recording the real analysis', () => {
  it('keeps every reading the AnalysisHost gives, and the section log, pre-roll included, replays through a fresh tracker to the sections recorded', async () => {
    const host = new AnalysisHost()
    await host.analysers.sectionModelReady
    const recorder = new SessionRecorder()
    // The analysis runs for 30 s before Record (long enough for the tracker to confirm the song and leave quiet), then records 25 s. The
    // tracker keeps running through Record, so the recording starts mid-song, not from quiet.
    const frames = syntheticCaptureFrames(60 * 60)
    const startAt = 60 * 30
    const stopAt = 60 * 55
    const readings: FrameReading[] = []
    frames.forEach((frame, i) => {
      // Record is pressed between frames, at the audio clock's now (a little after the newest frame), as LabSession.startRecording does.
      if (i === startAt) recorder.start(readings[i - 1]!.t + 1)
      const reading = host.push(frame)
      readings.push(reading)
      recorder.addFrame(reading, host.analysers.drumHits.getLastHits())
      if (i === stopAt) recorder.stop(reading.t)
    })
    const file = recorder.toFile({ sectionTicks: host.analysers.sectionTracker.getRecording(), sampleRate: 48000 })!
    const parsed = parseSessionFile(serializeSessionFile(file))

    expect(readings[startAt - 1]!.section).not.toBe('quiet')
    // Recording does not restart the tracker: the first recorded frame is still in the section it was in.
    expect(readings[startAt]!.section).toBe(readings[startAt - 1]!.section)
    expect(parsed.frames).toEqual(readings.slice(startAt, stopAt + 1))
    expect(parsed.frames.some(({ beat }) => beat)).toBe(true)
    const { ticks, tickMs } = parsed.sectionLog
    // The whole run: the 30 s pre-roll before Record and the 25 s recorded.
    expect(ticks.length).toBeGreaterThan((55000 / tickMs) * 0.9)
    expect(ticks[0]!.t).toBeLessThan(parsed.startMs)
    expect(ticks.every(({ t }) => t <= parsed.endMs)).toBe(true)

    const tracker = new SectionTracker()
    tracker.setModel(await loadSectionModel())
    // The replay's section at each recorded frame: after every tick that closed by then (the pre-roll first), as the live tracker had.
    let next = 0
    const replayed = parsed.frames.map(({ t }) => {
      while (next < ticks.length && ticks[next]!.t <= t) tracker.pushTick(ticks[next++]!)
      return tracker.getState().section
    })
    expect(tracker.getRecording()).toEqual(ticks)
    expect(replayed).toEqual(parsed.frames.map(({ section }) => section))

    // Without the pre-roll a fresh tracker starts from quiet and does not give the recorded sections: the pre-roll is what makes it match.
    const bare = new SectionTracker()
    bare.setModel(await loadSectionModel())
    const inside = ticks.filter(({ t }) => t >= parsed.startMs)
    let at = 0
    const bareReplay = parsed.frames.map(({ t }) => {
      while (at < inside.length && inside[at]!.t <= t) bare.pushTick(inside[at++]!)
      return bare.getState().section
    })
    expect(bareReplay).not.toEqual(replayed)
  })
})

describe('editedFileName', () => {
  it('marks a re-export as labelled once', () => {
    expect(editedFileName('beatsense-session-2026-11-03-09-05-07.json')).toBe('beatsense-session-2026-11-03-09-05-07-labelled.json')
    expect(editedFileName('song-labelled.json')).toBe('song-labelled.json')
    expect(editedFileName('take2.JSON')).toBe('take2-labelled.json')
  })
})
