// One reading of the Spotify player (GET /v1/me/player), in the shape the listening recorder keeps.

export type PlayerTrack = {
  id: string
  name: string
  artists: string[]
  /** The ISRC, for looking up the tempo elsewhere (Spotify's own audio features are closed to new apps). */
  isrc: string | null
  durationMs: number
}

export type PlayerSample = {
  /** When the reading was taken, on the app's tick clock (performance.now), the middle of the request. */
  t: number
  track: PlayerTrack | null
  progressMs: number | null
  isPlaying: boolean
  volumePercent: number | null
  deviceName: string | null
  deviceType: string | null
  contextUri: string | null
  shuffle: boolean | null
  /** Spotify's own timestamp of the last playback change (ms since 1970). */
  spotifyTimestamp: number | null
}

type JsonObject = Record<string, unknown>

const isObject = (value: unknown): value is JsonObject => typeof value === 'object' && value !== null && !Array.isArray(value)
const str = (value: unknown): string | null => (typeof value === 'string' ? value : null)
const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null)
const bool = (value: unknown): boolean | null => (typeof value === 'boolean' ? value : null)

const parseTrack = (item: unknown): PlayerTrack | null => {
  if (!isObject(item) || item.type !== 'track') return null
  const id = str(item.id)
  const durationMs = num(item.duration_ms)
  if (!id || durationMs === null) return null
  const artists = Array.isArray(item.artists) ? item.artists.flatMap((a) => (isObject(a) && typeof a.name === 'string' ? [a.name] : [])) : []
  const isrc = isObject(item.external_ids) ? str(item.external_ids.isrc) : null
  return { id, name: str(item.name) ?? '', artists, isrc, durationMs }
}

/** A reading from the playback state's JSON (null body, as for a 204, means nothing is playing). */
export const parsePlayback = (t: number, body: unknown): PlayerSample => {
  if (!isObject(body)) {
    return { t, track: null, progressMs: null, isPlaying: false, volumePercent: null, deviceName: null, deviceType: null, contextUri: null, shuffle: null, spotifyTimestamp: null }
  }
  const device = isObject(body.device) ? body.device : {}
  const context = isObject(body.context) ? body.context : {}
  return {
    t,
    track: parseTrack(body.item),
    progressMs: num(body.progress_ms),
    isPlaying: body.is_playing === true,
    volumePercent: num(device.volume_percent),
    deviceName: str(device.name),
    deviceType: str(device.type),
    contextUri: str(context.uri),
    shuffle: bool(body.shuffle_state),
    spotifyTimestamp: num(body.timestamp),
  }
}
