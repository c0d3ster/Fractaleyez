import { describe, expect, it } from 'vitest'

import {
  beatMarks, columnRanges, formatTime, frameIndexAt, levelPeaks, MIN_VIEW_MS, panView, sectionRuns, timeTicks, timeToX, xToTime, zoomViewAt,
} from '../../lab/recording/timeline'
import { FRAME_MS, syntheticReadings } from './syntheticFrames'

const BOUNDS = { startMs: 0, endMs: 60000 }

describe('view geometry', () => {
  it('maps time to pixels and back', () => {
    const view = { startMs: 1000, endMs: 3000 }
    expect(timeToX(2000, view, 400)).toBe(200)
    expect(xToTime(100, view, 400)).toBe(1500)
  })

  it('zooms around the anchor, which stays put', () => {
    const view = { startMs: 10000, endMs: 30000 }
    const zoomed = zoomViewAt(view, 15000, 0.5, BOUNDS)
    expect(zoomed.endMs - zoomed.startMs).toBe(10000)
    expect(xToTime(timeToX(15000, view, 1000), zoomed, 1000)).toBeCloseTo(15000)
  })

  it('stops at the shortest window and at the whole session', () => {
    const tiny = zoomViewAt({ startMs: 10000, endMs: 11000 }, 10500, 0.01, BOUNDS)
    expect(tiny.endMs - tiny.startMs).toBe(MIN_VIEW_MS)
    expect(zoomViewAt({ startMs: 10000, endMs: 30000 }, 20000, 100, BOUNDS)).toEqual(BOUNDS)
  })

  it('pans inside the session', () => {
    expect(panView({ startMs: 10000, endMs: 20000 }, 5000, BOUNDS)).toEqual({ startMs: 15000, endMs: 25000 })
    expect(panView({ startMs: 10000, endMs: 20000 }, -50000, BOUNDS)).toEqual({ startMs: 0, endMs: 10000 })
    expect(panView({ startMs: 50000, endMs: 60000 }, 5000, BOUNDS)).toEqual({ startMs: 50000, endMs: 60000 })
  })
})

describe('series', () => {
  const frames = syntheticReadings(600)

  it('finds a frame by time', () => {
    expect(frameIndexAt(frames, 0)).toBe(0)
    expect(frameIndexAt(frames, FRAME_MS * 10 - 0.001)).toBe(10)
    expect(frameIndexAt(frames, FRAME_MS * 10)).toBe(10)
    expect(frameIndexAt(frames, 1e9)).toBe(600)
  })

  it('keeps every peak per pixel column', () => {
    const view = { startMs: 0, endMs: frames[599]!.t }
    const columns = columnRanges(frames, ({ levels }) => levels[0]!, view, 20)
    expect(columns).toHaveLength(20)
    // A beat every 30 frames: every column of 30 frames holds one kick (40) and quiet frames (4).
    columns.forEach((range) => expect(range).toEqual({ min: 4, max: 40 }))
  })

  it('leaves columns empty where no frame or no value falls', () => {
    const zoomed = columnRanges(frames, ({ levels }) => levels[0]!, { startMs: 0, endMs: FRAME_MS * 2 }, 100)
    expect(zoomed.filter(Boolean)).toHaveLength(3)
    const noTempo = columnRanges(frames, ({ bpm }) => bpm, { startMs: 0, endMs: frames[599]!.t }, 10)
    expect(noTempo[0]).toBeNull()
    expect(noTempo[9]).toEqual({ min: 120, max: 120 })
  })

  it('splits the sections into runs', () => {
    const changing = syntheticReadings(100, 0, { section: (t) => (t < 500 ? 'buildup' : t < 1000 ? 'drop' : 'groove') })
    expect(sectionRuns(changing, 2000)).toEqual([
      { section: 'buildup', startMs: 0, endMs: 30 * FRAME_MS },
      { section: 'drop', startMs: 30 * FRAME_MS, endMs: 60 * FRAME_MS },
      { section: 'groove', startMs: 60 * FRAME_MS, endMs: 2000 },
    ])
  })

  it('lists the beats and each band\'s peak', () => {
    expect(beatMarks(frames)).toHaveLength(20)
    expect(beatMarks(frames)[1]).toEqual({ t: 30 * FRAME_MS, band: 0 })
    expect(levelPeaks(frames, 5)).toEqual([40, 3, 8, 1, 0.5])
  })
})

describe('axis', () => {
  it('picks a round step from the session start that keeps ticks apart', () => {
    expect(timeTicks({ startMs: 1000, endMs: 11000 }, 1000, 1000)).toEqual([1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000, 11000])
    expect(timeTicks({ startMs: 1300, endMs: 4300 }, 300, 300)).toEqual([1300, 2300, 3300, 4300])
    expect(timeTicks({ startMs: 0, endMs: 0 }, 300)).toEqual([])
  })

  it('formats times', () => {
    expect(formatTime(0)).toBe('0:00.0')
    expect(formatTime(83450)).toBe('1:23.5')
    expect(formatTime(59970)).toBe('1:00.0')
    expect(formatTime(1234, true)).toBe('0:01.23')
    expect(formatTime(-500)).toBe('-0:00.5')
  })
})
