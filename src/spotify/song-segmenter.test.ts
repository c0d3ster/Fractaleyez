import { describe, expect, it } from 'vitest'
import { SongSegmenter } from './song-segmenter'
import type { PlayerSample, PlayerTrack } from './player-sample'

const track = (id: string): PlayerTrack => ({ id, name: id, artists: ['a'], isrc: null, durationMs: 200000 })

const sample = (t: number, id: string | null, progressMs: number, isPlaying = true): PlayerSample => ({
  t, track: id ? track(id) : null, progressMs, isPlaying, volumePercent: 80, deviceName: 'd', deviceType: 'Computer', contextUri: null, shuffle: false, spotifyTimestamp: null,
})

// Readings every 1.5 s of a track playing from `fromMs` for `forMs`, starting at app time `t0`.
const play = (seg: SongSegmenter, id: string, t0: number, fromMs: number, forMs: number): ReturnType<SongSegmenter['push']>[] => {
  const ended = []
  for (let dt = 0; dt <= forMs; dt += 1500) ended.push(seg.push(sample(t0 + dt, id, fromMs + dt)))
  return ended.filter((e) => e !== null)
}

describe('SongSegmenter', () => {
  it('ends a song when the next track comes on, with how long it played', () => {
    const seg = new SongSegmenter()
    expect(play(seg, 'a', 0, 0, 60000)).toEqual([])
    const [ended] = play(seg, 'b', 61500, 2000, 3000)
    expect(ended).toMatchObject({ endReason: 'next-track', startT: 0, endT: 60000, startProgressMs: 0, endProgressMs: 60000, playedMs: 60000, seeks: 0 })
    expect(ended!.track.id).toBe('a')
    expect(seg.getCurrent()?.track.id).toBe('b')
  })

  it('counts a seek, and a jump back to the start as the song playing again', () => {
    const seg = new SongSegmenter()
    play(seg, 'a', 0, 0, 30000)
    expect(seg.push(sample(31500, 'a', 90000))).toBeNull()
    expect(seg.getCurrent()?.seeks).toBe(1)
    const restarted = seg.push(sample(33000, 'a', 500))
    expect(restarted?.endReason).toBe('restart')
    expect(seg.getCurrent()?.startProgressMs).toBe(500)
  })

  it('ends a song on a long gap in the readings, or when nothing is playing', () => {
    const seg = new SongSegmenter()
    play(seg, 'a', 0, 0, 30000)
    expect(seg.push(sample(100000, 'a', 100000))?.endReason).toBe('gap')
    expect(seg.push(sample(101500, null, 0))?.endReason).toBe('stopped')
    expect(seg.getCurrent()).toBeNull()
  })

  it('does not count paused time as played, and ends after a long pause', () => {
    const seg = new SongSegmenter()
    play(seg, 'a', 0, 0, 30000)
    let ended = null
    for (let t = 31500; t <= 31500 + 125000 && !ended; t += 1500) ended = seg.push(sample(t, 'a', 30000, false))
    expect(ended?.endReason).toBe('paused')
    expect(ended!.playedMs).toBe(31500)
    expect(ended!.pausedMs).toBeGreaterThanOrEqual(120000)
  })
})
