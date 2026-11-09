import { listenRepository, ListenData } from '../repositories/ListenRepository'
import { ListenPlayerSample, ListenSettings } from '../models/Listen'
import { getClerkClient } from '../clerk'

// Mirrors src/audioanalysis/tick-encoding.ts (TICK_ENCODING_VERSION, TICK_BYTES). The server stores the ticks as they come and only checks
// that they are whole ticks; the training scripts decode them.
const TICK_FORMAT = 1
const TICK_BYTES = 96
// A long song (about 12 minutes) with its padding; anything bigger is not one song.
const MAX_TICKS = 16000
const MAX_PLAYER_SAMPLES = 1000
const END_REASONS = ['next-track', 'restart', 'stopped', 'paused', 'gap']

export class ListenValidationError extends Error {
  readonly status = 400
}

type JsonObject = Record<string, unknown>

const isObject = (value: unknown): value is JsonObject => typeof value === 'object' && value !== null && !Array.isArray(value)

const fail = (field: string): never => {
  throw new ListenValidationError(`invalid ${field}`)
}

const num = (body: JsonObject, field: string): number => {
  const value = body[field]
  return typeof value === 'number' && Number.isFinite(value) ? value : fail(field)
}

const str = (body: JsonObject, field: string, max = 500): string => {
  const value = body[field]
  return typeof value === 'string' && value.length <= max ? value : fail(field)
}

const optStr = (body: JsonObject, field: string, max = 500): string | null => (body[field] === null || body[field] === undefined ? null : str(body, field, max))

const optNum = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null)

const optStrValue = (value: unknown): string | null => (typeof value === 'string' ? value.slice(0, 500) : null)

const parsePlayerSample = (value: unknown): ListenPlayerSample => {
  if (!isObject(value) || typeof value.t !== 'number') return fail('player')
  return {
    t: value.t,
    trackId: optStrValue(value.trackId),
    progressMs: optNum(value.progressMs),
    isPlaying: value.isPlaying === true,
    volumePercent: optNum(value.volumePercent),
    deviceName: optStrValue(value.deviceName),
    deviceType: optStrValue(value.deviceType),
    contextUri: optStrValue(value.contextUri),
    shuffle: typeof value.shuffle === 'boolean' ? value.shuffle : null,
    spotifyTimestamp: optNum(value.spotifyTimestamp),
  }
}

const parseSettings = (value: unknown): ListenSettings => {
  if (!isObject(value)) return { enabledBands: [], sensitivity: null, ignoreMs: null }
  const bands = Array.isArray(value.enabledBands) ? value.enabledBands.slice(0, 16).map((b) => b === true) : []
  return { enabledBands: bands, sensitivity: optNum(value.sensitivity), ignoreMs: optNum(value.ignoreMs) }
}

/** Checks an upload from the app's listening recorder (src/spotify/listen-recorder.ts) and turns it into a listen for `userId`. */
export const parseListen = (userId: string, body: unknown): ListenData => {
  if (!isObject(body)) return fail('body')
  if (body.tickFormat !== TICK_FORMAT || body.tickBytes !== TICK_BYTES) return fail('tickFormat')
  const ticks = Buffer.from(str(body, 'ticks', MAX_TICKS * TICK_BYTES * 2), 'base64')
  if (ticks.length === 0 || ticks.length % TICK_BYTES !== 0 || ticks.length / TICK_BYTES > MAX_TICKS) return fail('ticks')
  const startedAt = new Date(str(body, 'startedAt', 40))
  if (Number.isNaN(startedAt.getTime())) return fail('startedAt')
  const endReason = str(body, 'endReason', 20)
  if (!END_REASONS.includes(endReason)) return fail('endReason')
  if (!Array.isArray(body.player) || body.player.length > MAX_PLAYER_SAMPLES) return fail('player')
  const artists = Array.isArray(body.artists) ? body.artists.filter((a): a is string => typeof a === 'string').slice(0, 20) : []
  const edges = Array.isArray(body.spectrumEdgesHz) ? body.spectrumEdgesHz.filter((e): e is number => typeof e === 'number').slice(0, 256) : []
  return {
    userId,
    trackId: str(body, 'trackId', 64),
    trackName: str(body, 'trackName'),
    artists,
    isrc: optStr(body, 'isrc', 20),
    durationMs: num(body, 'durationMs'),
    startedAt,
    songStartT: num(body, 'songStartT'),
    songEndT: num(body, 'songEndT'),
    startProgressMs: num(body, 'startProgressMs'),
    endProgressMs: num(body, 'endProgressMs'),
    playedMs: num(body, 'playedMs'),
    pausedMs: num(body, 'pausedMs'),
    seeks: num(body, 'seeks'),
    endReason,
    contextUri: optStr(body, 'contextUri'),
    deviceName: optStr(body, 'deviceName'),
    deviceType: optStr(body, 'deviceType'),
    tickFormat: TICK_FORMAT,
    tickBytes: TICK_BYTES,
    tickMs: num(body, 'tickMs'),
    tickCount: ticks.length / TICK_BYTES,
    spectrumEdgesHz: edges,
    ticks,
    player: body.player.map(parsePlayerSample),
    settings: parseSettings(body.settings),
  }
}

type DeezerTrack = { bpm?: unknown; error?: unknown }

/** The part of fetch the Deezer lookup uses, so tests can hand it a fake. */
export type Fetcher = (url: string) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>

/** Deezer's BPM for an ISRC, or null (no such track, or Deezer has no tempo for it: it returns 0 then). */
export const lookupDeezerBpm = async (isrc: string, fetcher: Fetcher = fetch): Promise<number | null> => {
  const res = await fetcher(`https://api.deezer.com/track/isrc:${encodeURIComponent(isrc)}`)
  if (!res.ok) throw new Error(`Deezer: ${res.status}`)
  const body: unknown = await res.json()
  if (!isObject(body)) return null
  const { bpm }: DeezerTrack = body
  return typeof bpm === 'number' && bpm > 0 ? Math.round(bpm * 100) / 100 : null
}

export type SpotifyToken = { token: string; expiresAt: number | null; scopes: string[] }

export class ListenService {
  async saveListen(userId: string, body: unknown): Promise<{ id: string; tickCount: number; deezerBpm: number | null }> {
    const data = parseListen(userId, body)
    const listen = await listenRepository.upsertListen(data)
    const track = await listenRepository.upsertTrack({
      trackId: data.trackId, name: data.trackName, artists: data.artists, isrc: data.isrc, durationMs: data.durationMs,
    })
    let { deezerBpm } = track
    if (track.deezerCheckedAt === null && data.isrc) {
      // Best effort: a failed lookup is tried again on the next listen of the track.
      try {
        deezerBpm = await lookupDeezerBpm(data.isrc)
        await listenRepository.setDeezerBpm(data.trackId, deezerBpm)
      } catch (err) {
        console.warn('Deezer BPM lookup failed', err)
      }
    }
    return { id: String(listen._id), tickCount: data.tickCount, deezerBpm }
  }

  /** The user's Spotify access token through Clerk (it refreshes it), or null when Spotify is not connected. */
  async spotifyToken(userId: string): Promise<SpotifyToken | null> {
    const { data } = await getClerkClient().users.getUserOauthAccessToken(userId, 'spotify')
    const first = data[0]
    if (!first) return null
    return { token: first.token, expiresAt: first.expiresAt ?? null, scopes: first.scopes ?? [] }
  }
}

export const listenService = new ListenService()
