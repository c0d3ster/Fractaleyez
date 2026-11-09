import { describe, expect, it, vi } from 'vitest'

vi.mock('../repositories/ListenRepository', () => ({ listenRepository: {} }))
vi.mock('../clerk', () => ({ getClerkClient: () => ({}) }))

import { Fetcher, ListenValidationError, lookupDeezerBpm, parseListen } from './ListenService'

const TICK_BYTES = 96

const upload = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  trackId: 't1',
  trackName: 'Song',
  artists: ['A', 7],
  isrc: 'US1234567890',
  durationMs: 200000,
  startedAt: '2026-11-09T20:00:00.000Z',
  songStartT: 1000,
  songEndT: 180000,
  startProgressMs: 0,
  endProgressMs: 179000,
  playedMs: 179000,
  pausedMs: 0,
  seeks: 0,
  endReason: 'next-track',
  contextUri: 'spotify:playlist:x',
  deviceName: 'Laptop',
  deviceType: 'Computer',
  tickFormat: 1,
  tickBytes: TICK_BYTES,
  tickMs: 50,
  spectrumEdgesHz: [40, 46],
  ticks: Buffer.alloc(TICK_BYTES * 3).toString('base64'),
  player: [{ t: 1000, trackId: 't1', progressMs: 0, isPlaying: true, volumePercent: 70, extra: 'dropped' }],
  settings: { enabledBands: [true, false], sensitivity: 1.2, ignoreMs: 100 },
  ...overrides,
})

describe('parseListen', () => {
  it('turns a recorder upload into a listen, keeping only known fields', () => {
    const listen = parseListen('user_1', upload())
    expect(listen).toMatchObject({ userId: 'user_1', trackId: 't1', artists: ['A'], tickCount: 3, endReason: 'next-track' })
    expect(listen.startedAt.toISOString()).toBe('2026-11-09T20:00:00.000Z')
    expect(listen.ticks.length).toBe(TICK_BYTES * 3)
    expect(listen.player).toEqual([{
      t: 1000, trackId: 't1', progressMs: 0, isPlaying: true, volumePercent: 70, deviceName: null, deviceType: null, contextUri: null, shuffle: null, spotifyTimestamp: null,
    }])
    expect(listen.settings).toEqual({ enabledBands: [true, false], sensitivity: 1.2, ignoreMs: 100 })
  })

  it('refuses partial ticks, another tick format, a bad date or end reason, and a missing number', () => {
    const bad = [
      { ticks: Buffer.alloc(TICK_BYTES + 5).toString('base64') },
      { ticks: '' },
      { tickBytes: 80 },
      { startedAt: 'yesterday' },
      { endReason: 'bored' },
      { durationMs: 'long' },
      { player: 'none' },
    ]
    bad.forEach((overrides) => expect(() => parseListen('u', upload(overrides))).toThrow(ListenValidationError))
    expect(() => parseListen('u', null)).toThrow(ListenValidationError)
  })
})

describe('lookupDeezerBpm', () => {
  const fakeFetch = (body: unknown, ok = true): Fetcher => async () => ({ ok, status: ok ? 200 : 500, json: async () => body })

  it('returns Deezer\'s tempo, and null for none (Deezer says 0) or an unknown ISRC', async () => {
    expect(await lookupDeezerBpm('X', fakeFetch({ bpm: 124.912 }))).toBe(124.91)
    expect(await lookupDeezerBpm('X', fakeFetch({ bpm: 0 }))).toBeNull()
    expect(await lookupDeezerBpm('X', fakeFetch({ error: { code: 800 } }))).toBeNull()
    await expect(lookupDeezerBpm('X', fakeFetch({}, false))).rejects.toThrow()
  })
})
