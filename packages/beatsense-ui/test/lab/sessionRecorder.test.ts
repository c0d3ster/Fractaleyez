import { describe, expect, it } from 'vitest'

import { SessionRecorder, type LastDrumHits } from '../../lab/recording/sessionRecorder'
import { FRAME_MS, syntheticReadings } from './syntheticFrames'

const NO_HITS: LastDrumHits = { kick: null, hat: null, snare: null, clap: null }

describe('SessionRecorder', () => {
  it('keeps nothing until Record and nothing after Stop', () => {
    const recorder = new SessionRecorder()
    const readings = syntheticReadings(300)
    readings.slice(0, 100).forEach((reading) => recorder.addFrame(reading))
    expect(recorder.addLabel('kick', 50)).toBeNull()
    expect(recorder.frameCount()).toBe(0)

    recorder.start(readings[100]!.t)
    readings.slice(100, 200).forEach((reading) => recorder.addFrame(reading))
    recorder.stop(readings[199]!.t)
    readings.slice(200).forEach((reading) => recorder.addFrame(reading))

    expect(recorder.getPhase()).toBe('stopped')
    expect(recorder.frameCount()).toBe(100)
    expect(recorder.durationMs()).toBeCloseTo(99 * FRAME_MS)
  })

  it('skips a frame from before the start (queued when Record was pressed)', () => {
    const recorder = new SessionRecorder()
    const [early, late] = syntheticReadings(2, 10)
    recorder.start(late!.t)
    recorder.addFrame(early!)
    recorder.addFrame(late!)
    expect(recorder.frameCount()).toBe(1)
  })

  it('copies each reading, so a reused levels array cannot change what was kept', () => {
    const recorder = new SessionRecorder()
    const [reading] = syntheticReadings(1)
    recorder.start(0)
    recorder.addFrame(reading!)
    reading!.levels[0] = -1
    recorder.stop(10)
    expect(recorder.toFile({ sectionTicks: [], sampleRate: 48000 })!.frames[0]!.levels[0]).not.toBe(-1)
  })

  it('stamps labels with ids, counts them and undoes the newest', () => {
    const recorder = new SessionRecorder()
    recorder.start(0)
    expect(recorder.addLabel('kick', 500)).toEqual({ id: 1, kind: 'kick', t: 500 })
    recorder.addLabel('snare', 1000)
    recorder.addLabel('kick', 1500)
    expect(recorder.labelCounts()).toMatchObject({ kick: 2, snare: 1, clap: 0 })
    expect(recorder.undoLabel()?.id).toBe(3)
    expect(recorder.addLabel('hat', 1600)?.id).toBe(4)
    expect(recorder.labelCounts()).toMatchObject({ kick: 1, snare: 1, hat: 1 })
  })

  it('keeps each drum hit once though getLastHits repeats it every frame, and none from before the start', () => {
    const recorder = new SessionRecorder()
    const readings = syntheticReadings(60, 60)
    recorder.start(readings[0]!.t)
    readings.forEach((reading, i) => {
      const kick = i >= 10 ? (i >= 40 ? readings[40]!.t : readings[10]!.t) : 100
      const hat = i >= 20 ? readings[25]!.t - 3 : null
      recorder.addFrame(reading, { ...NO_HITS, kick, hat })
    })
    recorder.stop(readings[59]!.t)
    const { drumHits } = recorder.toFile({ sectionTicks: [], sampleRate: null })!
    expect(drumHits).toEqual([
      { kind: 'kick', t: readings[10]!.t },
      { kind: 'hat', t: readings[25]!.t - 3 },
      { kind: 'kick', t: readings[40]!.t },
    ])
  })

  it('makes a file only once stopped, with the section ticks inside the session and labels sorted', () => {
    const recorder = new SessionRecorder()
    recorder.start(1000)
    syntheticReadings(120, 60).forEach((reading) => recorder.addFrame(reading))
    recorder.addLabel('drop', 2500)
    recorder.addLabel('kick', 1200)
    expect(recorder.toFile({ sectionTicks: [], sampleRate: 48000 })).toBeNull()
    recorder.stop(3000)

    const ticks = Array.from({ length: 80 }, (_, i) => ({ t: i * 50, power: [1, 1, 1, 1, 1], beats: i % 10 === 0 ? 1 : 0, bpm: 120 }))
    const savedAt = new Date('2026-11-13T20:00:00Z')
    const file = recorder.toFile({ sectionTicks: ticks, sampleRate: 48000, savedAt })!
    expect(file.format).toBe('beatsense-lab-session')
    expect(file.version).toBe(1)
    expect(file.recordedAt).toBe('2026-11-13T20:00:00.000Z')
    expect(file.startMs).toBe(1000)
    expect(file.endMs).toBe(3000)
    expect(file.frames).toHaveLength(120)
    expect(file.labels.map(({ kind }) => kind)).toEqual(['kick', 'drop'])
    expect(file.sectionLog.version).toBe(2)
    expect(file.sectionLog.ticks[0]!.t).toBe(1000)
    expect(file.sectionLog.ticks[file.sectionLog.ticks.length - 1]!.t).toBeLessThanOrEqual(file.endMs)
  })

  it('starts clean on a second Record', () => {
    const recorder = new SessionRecorder()
    recorder.start(0)
    syntheticReadings(10).forEach((reading) => recorder.addFrame(reading))
    recorder.addLabel('kick', 10)
    recorder.stop(200)
    recorder.start(500)
    expect(recorder.frameCount()).toBe(0)
    expect(recorder.labelCounts().kick).toBe(0)
    expect(recorder.addLabel('snare', 600)?.id).toBe(1)
  })
})
