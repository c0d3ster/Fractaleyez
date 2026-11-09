import { describe, expect, it } from 'vitest'
import { parsePlayback } from './player-sample'

describe('parsePlayback', () => {
  it('reads the fields the recorder keeps from Spotify\'s playback state', () => {
    const sample = parsePlayback(1000, {
      device: { name: 'Laptop', type: 'Computer', volume_percent: 70 },
      shuffle_state: true,
      context: { uri: 'spotify:playlist:x' },
      timestamp: 1700000000000,
      progress_ms: 42000,
      is_playing: true,
      item: { type: 'track', id: 't1', name: 'Song', duration_ms: 180000, artists: [{ name: 'A' }, { name: 'B' }], external_ids: { isrc: 'US1234567890' } },
    })
    expect(sample).toEqual({
      t: 1000,
      track: { id: 't1', name: 'Song', artists: ['A', 'B'], isrc: 'US1234567890', durationMs: 180000 },
      progressMs: 42000,
      isPlaying: true,
      volumePercent: 70,
      deviceName: 'Laptop',
      deviceType: 'Computer',
      contextUri: 'spotify:playlist:x',
      shuffle: true,
      spotifyTimestamp: 1700000000000,
    })
  })

  it('treats nothing playing, an episode or an ad as no track', () => {
    expect(parsePlayback(0, null).track).toBeNull()
    expect(parsePlayback(0, { is_playing: true, item: { type: 'episode', id: 'e', duration_ms: 1 } }).track).toBeNull()
    expect(parsePlayback(0, { is_playing: true, item: null }).isPlaying).toBe(true)
  })
})
