import { describe, expect, it } from 'vitest'

import { PlaybackLog, segmentAt, sliceLog, songTimeAt, type PlaybackSegment } from '../../lab/player/playbackLog'

// Played from 0:10 at t = 1000; seeked to 1:00 at t = 6000; paused at t = 9000; played on at t = 12000.
const LOG: PlaybackSegment[] = [
  { atMs: 1000, songMs: 10000, loop: null },
  { atMs: 6000, songMs: 60000, loop: null },
  { atMs: 9000, songMs: null, loop: null },
  { atMs: 12000, songMs: 63000, loop: null },
]

describe('songTimeAt', () => {
  it('follows plays, seeks and pauses', () => {
    expect(songTimeAt(LOG, 500)).toBeNull()
    expect(songTimeAt(LOG, 1000)).toBe(10000)
    expect(songTimeAt(LOG, 5999)).toBe(14999)
    expect(songTimeAt(LOG, 7000)).toBe(61000)
    expect(songTimeAt(LOG, 10000)).toBeNull()
    expect(songTimeAt(LOG, 13000)).toBe(64000)
    expect(segmentAt(LOG, 8000)).toBe(LOG[1])
  })

  it('wraps a loop', () => {
    // Looping 30 s to 34 s, entered at 32 s.
    const looped: PlaybackSegment[] = [{ atMs: 0, songMs: 32000, loop: { startMs: 30000, endMs: 34000 } }]
    expect(songTimeAt(looped, 1000)).toBe(33000)
    expect(songTimeAt(looped, 2000)).toBe(30000)
    expect(songTimeAt(looped, 5500)).toBe(33500)
    expect(songTimeAt(looped, 6000)).toBe(30000)
  })
})

describe('sliceLog', () => {
  it('gives one slice per stretch between changes, none while paused', () => {
    expect(sliceLog(LOG, 0, 15000)).toEqual([
      { fromMs: 1000, toMs: 6000, offsetMs: 9000 },
      { fromMs: 6000, toMs: 9000, offsetMs: 54000 },
      { fromMs: 12000, toMs: 15000, offsetMs: 51000 },
    ])
  })

  it('clips to the recording', () => {
    expect(sliceLog(LOG, 3000, 7000)).toEqual([
      { fromMs: 3000, toMs: 6000, offsetMs: 9000 },
      { fromMs: 6000, toMs: 7000, offsetMs: 54000 },
    ])
  })

  it('cuts a loop at every wrap, each turn with its own offset', () => {
    const looped: PlaybackSegment[] = [{ atMs: 0, songMs: 32000, loop: { startMs: 30000, endMs: 34000 } }]
    const slices = sliceLog(looped, 0, 9000)
    expect(slices).toEqual([
      { fromMs: 0, toMs: 2000, offsetMs: 32000 },
      { fromMs: 2000, toMs: 6000, offsetMs: 28000 },
      { fromMs: 6000, toMs: 9000, offsetMs: 24000 },
    ])
    // Every slice agrees with songTimeAt.
    slices.forEach(({ fromMs, toMs, offsetMs }) => {
      for (let t = fromMs; t < toMs; t += 250) expect(songTimeAt(looped, t)).toBe(t + offsetMs)
    })
  })
})

describe('PlaybackLog', () => {
  it('keeps changes in order, a change at the same moment replacing the last', () => {
    const log = new PlaybackLog()
    log.record({ atMs: 100, songMs: 0, loop: null })
    log.record({ atMs: 100, songMs: 5000, loop: null })
    log.record({ atMs: 300, songMs: null, loop: null })
    expect(log.segments()).toEqual([{ atMs: 100, songMs: 5000, loop: null }, { atMs: 300, songMs: null, loop: null }])
    expect(log.songTimeAt(200)).toBe(5100)
  })

  it('hands out the segments a recording needs', () => {
    const log = new PlaybackLog()
    LOG.forEach(log.record)
    expect(log.between(7000, 10000)).toEqual([LOG[1], LOG[2]])
    expect(log.between(13000, 20000)).toEqual([LOG[3]])
    expect(log.between(0, 500)).toEqual([LOG[0]])
  })
})
