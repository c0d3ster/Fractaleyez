// Splits a stream of Spotify player readings into songs: where each one played on the app's clock, how much of it, and how it ended.
import type { PlayerSample, PlayerTrack } from './player-sample'

export type SongEnd = 'next-track' | 'restart' | 'stopped' | 'paused' | 'gap'

export type SongListen = {
  track: PlayerTrack
  /** The first and last reading of the song, on the app's clock. */
  startT: number
  endT: number
  startProgressMs: number
  endProgressMs: number
  /** Time it was playing (not paused) between those readings. */
  playedMs: number
  pausedMs: number
  /** Jumps in the song's position that playing does not explain (a seek, a skip back). */
  seeks: number
  endReason: SongEnd
  /** Every reading while it was the current song. */
  samples: PlayerSample[]
}

// A position this far from where playing would have put it is a seek, not clock noise or request lag.
const SEEK_MS = 3000
// The same track going back to its start this far is it playing again (repeat), a new listen.
const RESTART_BACK_MS = 10000
const RESTART_NEAR_START_MS = 10000
// Paused this long ends the song; no reading for this long (the tab was hidden, the app stopped polling) does too.
const PAUSE_END_MS = 120000
const GAP_END_MS = 30000

type Current = SongListen & { lastSample: PlayerSample; pausedSince: number | null }

export class SongSegmenter {
  private current: Current | null = null

  /** Takes one reading; returns the song it ended, if it ended one. */
  push = (sample: PlayerSample): SongListen | null => {
    const current = this.current
    if (current && sample.t - current.lastSample.t > GAP_END_MS) {
      const ended = this.close('gap')
      this.startIfPlaying(sample)
      return ended
    }
    const { track } = sample
    if (!current) {
      this.startIfPlaying(sample)
      return null
    }
    if (!track) return this.close('stopped')
    if (track.id !== current.track.id) {
      const ended = this.close('next-track')
      this.startIfPlaying(sample)
      return ended
    }
    const last = current.lastSample
    const progress = sample.progressMs ?? current.endProgressMs
    const elapsed = sample.t - last.t
    if (last.isPlaying) current.playedMs += elapsed
    else current.pausedMs += elapsed
    if (progress < current.endProgressMs - RESTART_BACK_MS && progress < RESTART_NEAR_START_MS) {
      const ended = this.close('restart')
      this.startIfPlaying(sample)
      return ended
    }
    const expected = current.endProgressMs + (last.isPlaying ? elapsed : 0)
    if (Math.abs(progress - expected) > SEEK_MS) current.seeks++
    current.pausedSince = sample.isPlaying ? null : (current.pausedSince ?? sample.t)
    current.endT = sample.t
    current.endProgressMs = progress
    current.lastSample = sample
    current.samples.push(sample)
    if (current.pausedSince !== null && sample.t - current.pausedSince >= PAUSE_END_MS) return this.close('paused')
    return null
  }

  /** The song playing now, if any (not ended). */
  getCurrent = (): SongListen | null => this.current

  /** Ends the current song (the recorder is being turned off). */
  flush = (): SongListen | null => (this.current ? this.close('stopped') : null)

  private startIfPlaying = (sample: PlayerSample): void => {
    if (!sample.track || !sample.isPlaying) return
    const progress = sample.progressMs ?? 0
    this.current = {
      track: sample.track,
      startT: sample.t,
      endT: sample.t,
      startProgressMs: progress,
      endProgressMs: progress,
      playedMs: 0,
      pausedMs: 0,
      seeks: 0,
      endReason: 'stopped',
      samples: [sample],
      lastSample: sample,
      pausedSince: null,
    }
  }

  private close = (endReason: SongEnd): SongListen | null => {
    const current = this.current
    this.current = null
    if (!current) return null
    const { track, startT, endT, startProgressMs, endProgressMs, playedMs, pausedMs, seeks, samples } = current
    return { track, startT, endT, startProgressMs, endProgressMs, playedMs, pausedMs, seeks, endReason, samples }
  }
}
