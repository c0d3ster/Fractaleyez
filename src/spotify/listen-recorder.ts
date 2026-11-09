// Records listening sessions for training the section model on real songs heard through the real mic.
//
// While it is on, it polls the Spotify player every POLL_MS, splits the readings into songs (song-segmenter.ts) and, once a song has
// ended and PAD_MS more has been recorded, saves the section tracker's ticks around it (the padding keeps a crossfade's both sides) with
// the player readings, through POST /api/listens. Only band power, onsets and a coarse spectrum are kept, never audio.
//
// The analysis runs on animation frames, so nothing is recorded while the tab is hidden; a song cut by that ends as a 'gap'.
import { sectionTracker } from '../audioanalysis/sections'
import { spectrumEdgesHz } from '../audioanalysis/tick-extras'
import { TICK_BYTES, TICK_ENCODING_VERSION, bytesToBase64, encodeTicks } from '../audioanalysis/tick-encoding'
import { TICK_MS } from '../audioanalysis/section-features'
import { DEFAULT_ENABLED_BANDS } from '../audioanalysis/onset-bands'
import { PlayerSample, parsePlayback } from './player-sample'
import { SongListen, SongSegmenter } from './song-segmenter'

/** What recording needs: reading what plays and the player's state. */
const RECORD_SCOPES = ['user-read-currently-playing', 'user-read-playback-state']
/** What the grant asks for: also playback control, so the label review page can jump Spotify to a spot in the song. */
export const SPOTIFY_SCOPES = [...RECORD_SCOPES, 'user-modify-playback-state']

const POLL_MS = 1500
const PAD_MS = 15000
// A song heard for less than this is a skip, not worth labelling.
const MIN_PLAYED_MS = 30000
const PLAYER_URL = 'https://api.spotify.com/v1/me/player?additional_types=track'
const STORAGE_KEY = 'listenRecording'
const RETRIES = 3

export type RecorderStatus =
  | 'off'
  | 'signed-out'
  | 'needs-permission'
  | 'idle'
  | 'recording'
  | 'error'

export type RecorderState = {
  status: RecorderStatus
  /** The song being recorded now. */
  track: { name: string; artists: string[] } | null
  saved: number
  skipped: number
  failed: number
  lastSaved: string | null
  error: string | null
}

type TokenGetter = () => Promise<string | null>
type SpotifyToken = { token: string; expiresAt: number | null; scopes: string[] }

type PendingSave = { song: SongListen; dueT: number }

const now = (): number => performance.now()

const readEnabled = (): boolean => {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

const writeEnabled = (enabled: boolean): void => {
  try {
    if (enabled) localStorage.setItem(STORAGE_KEY, '1')
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Private mode: the switch just does not survive a reload.
  }
}

const isTokenResponse = (value: unknown): value is { token: string; expiresAt?: number | null; scopes?: string[] } =>
  typeof value === 'object' && value !== null && 'token' in value && typeof value.token === 'string'

const compactSample = (s: PlayerSample): Record<string, unknown> => ({
  t: Math.round(s.t),
  trackId: s.track?.id ?? null,
  progressMs: s.progressMs,
  isPlaying: s.isPlaying,
  volumePercent: s.volumePercent,
  deviceName: s.deviceName,
  deviceType: s.deviceType,
  contextUri: s.contextUri,
  shuffle: s.shuffle,
  spotifyTimestamp: s.spotifyTimestamp,
})

export class ListenRecorder {
  private getAuthToken: TokenGetter | null = null
  private allowed = false
  private enabled = readEnabled()
  private timer: number | null = null
  // Bumped on every start, so a poll still awaiting from before a quick off and on does not start a second loop.
  private generation = 0
  private spotify: SpotifyToken | null = null
  private segmenter = new SongSegmenter()
  // Every reading of the last while, so a saved song carries the next song's first readings too (the other side of a crossfade).
  private samples: PlayerSample[] = []
  private pending: PendingSave[] = []
  private backoffUntil = 0
  private readonly listeners = new Set<() => void>()
  private state: RecorderState = { status: 'off', track: null, saved: 0, skipped: 0, failed: 0, lastSaved: null, error: null }

  /** Called from React once Clerk and the user's admin flag are known (recording is admin-only for now). */
  setAuth = (getToken: TokenGetter | null, allowed: boolean): void => {
    this.getAuthToken = getToken
    this.allowed = allowed && getToken !== null
    this.spotify = null
    this.sync()
  }

  isEnabled = (): boolean => this.enabled

  setEnabled = (enabled: boolean): void => {
    this.enabled = enabled
    writeEnabled(enabled)
    this.sync()
  }

  getState = (): RecorderState => this.state

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private update = (patch: Partial<RecorderState>): void => {
    this.state = { ...this.state, ...patch }
    this.listeners.forEach((listener) => listener())
  }

  private sync = (): void => {
    const run = this.enabled && this.allowed
    if (run && this.timer === null) {
      this.update({ status: 'idle', error: null })
      const generation = ++this.generation
      this.timer = window.setTimeout(() => void this.poll(generation), 0)
    } else if (!run && this.timer !== null) {
      window.clearTimeout(this.timer)
      this.timer = null
      const song = this.segmenter.flush()
      if (song) this.queue(song)
      void this.savePending(true)
    }
    if (!run) this.update({ status: this.enabled && !this.allowed ? 'signed-out' : 'off', track: null })
  }

  private poll = async (generation: number): Promise<void> => {
    try {
      await this.pollOnce()
    } catch (err) {
      this.update({ status: 'error', error: err instanceof Error ? err.message : String(err) })
    }
    await this.savePending(false)
    if (this.timer === null || generation !== this.generation) return
    this.timer = window.setTimeout(() => void this.poll(generation), Math.max(POLL_MS, this.backoffUntil - now()))
  }

  private pollOnce = async (): Promise<void> => {
    if (now() < this.backoffUntil) return
    const spotify = await this.spotifyToken()
    if (!spotify) return
    const sent = now()
    const res = await fetch(PLAYER_URL, { headers: { Authorization: `Bearer ${spotify.token}` } })
    const t = (sent + now()) / 2
    if (res.status === 401) {
      this.spotify = null
      const text = await res.text()
      if (text.includes('Permissions missing')) this.update({ status: 'needs-permission' })
      return
    }
    if (res.status === 429) {
      const retry = Number(res.headers.get('Retry-After') ?? '5')
      this.backoffUntil = now() + (Number.isFinite(retry) ? retry : 5) * 1000
      return
    }
    if (res.status !== 200 && res.status !== 204) throw new Error(`Spotify player: ${res.status}`)
    const body: unknown = res.status === 204 ? null : await res.json()
    const sample = parsePlayback(t, body)
    this.samples.push(sample)
    const ended = this.segmenter.push(sample)
    if (ended) this.queue(ended)
    const current = this.segmenter.getCurrent()
    this.update({
      status: current ? 'recording' : 'idle',
      track: current ? { name: current.track.name, artists: current.track.artists } : null,
      error: null,
    })
  }

  private spotifyToken = async (): Promise<SpotifyToken | null> => {
    const cached = this.spotify
    if (cached && (cached.expiresAt === null || cached.expiresAt - Date.now() > 60000)) return cached
    const authToken = await this.getAuthToken?.()
    if (!authToken) {
      this.update({ status: 'signed-out' })
      return null
    }
    const res = await fetch('/api/spotify/token', { headers: { Authorization: `Bearer ${authToken}` } })
    if (res.status === 404) {
      this.update({ status: 'needs-permission', error: 'Spotify is not connected to this account' })
      return null
    }
    if (!res.ok) throw new Error(`Spotify token: ${res.status}`)
    const body: unknown = await res.json()
    if (!isTokenResponse(body)) throw new Error('Spotify token: unexpected response')
    const scopes = body.scopes ?? []
    if (!RECORD_SCOPES.every((scope) => scopes.includes(scope))) {
      this.update({ status: 'needs-permission' })
      return null
    }
    this.spotify = { token: body.token, expiresAt: body.expiresAt ?? null, scopes }
    return this.spotify
  }

  private queue = (song: SongListen): void => {
    if (song.playedMs < MIN_PLAYED_MS) {
      this.update({ skipped: this.state.skipped + 1 })
      return
    }
    this.pending.push({ song, dueT: song.endT + PAD_MS })
  }

  /** Saves every song whose padding has been recorded (or every one, when the recorder stops). */
  private savePending = async (all: boolean): Promise<void> => {
    const due = this.pending.filter(({ dueT }) => all || now() >= dueT)
    if (due.length === 0) return
    this.pending = this.pending.filter((p) => !due.includes(p))
    for (const { song } of due) await this.save(song)
    const oldestNeeded = Math.min(...this.pending.map(({ song }) => song.startT), this.segmenter.getCurrent()?.startT ?? Infinity) - PAD_MS
    this.samples = this.samples.filter(({ t }) => t >= oldestNeeded)
  }

  private save = async (song: SongListen): Promise<void> => {
    const from = song.startT - PAD_MS
    const to = song.endT + PAD_MS
    const ticks = sectionTracker.getRecording(from, to)
    if (ticks.length === 0) {
      this.update({ failed: this.state.failed + 1, error: 'no audio was recorded for that song' })
      return
    }
    const { track } = song
    const first = song.samples[0]
    const { audio } = window.config
    const body = {
      trackId: track.id,
      trackName: track.name,
      artists: track.artists,
      isrc: track.isrc,
      durationMs: track.durationMs,
      startedAt: new Date(Date.now() - (now() - song.startT)).toISOString(),
      songStartT: Math.round(song.startT),
      songEndT: Math.round(song.endT),
      startProgressMs: song.startProgressMs,
      endProgressMs: song.endProgressMs,
      playedMs: Math.round(song.playedMs),
      pausedMs: Math.round(song.pausedMs),
      seeks: song.seeks,
      endReason: song.endReason,
      contextUri: first?.contextUri ?? null,
      deviceName: first?.deviceName ?? null,
      deviceType: first?.deviceType ?? null,
      tickFormat: TICK_ENCODING_VERSION,
      tickBytes: TICK_BYTES,
      tickMs: TICK_MS,
      spectrumEdgesHz: spectrumEdgesHz(),
      ticks: bytesToBase64(encodeTicks(ticks)),
      player: this.samples.filter(({ t }) => t >= from && t <= to).map(compactSample),
      settings: {
        enabledBands: window.enabledFreqBands ?? DEFAULT_ENABLED_BANDS,
        sensitivity: audio.soundThreshold.value,
        ignoreMs: audio.ignoreTime.value,
      },
    }
    for (let attempt = 0; attempt < RETRIES; attempt++) {
      try {
        const authToken = await this.getAuthToken?.()
        if (!authToken) break
        const res = await fetch('/api/listens', {
          method: 'POST',
          headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (res.ok) {
          this.update({ saved: this.state.saved + 1, lastSaved: `${track.name} (${track.artists.join(', ')})` })
          return
        }
        if (res.status < 500) {
          this.update({ failed: this.state.failed + 1, error: `save failed: ${res.status} ${await res.text()}` })
          return
        }
      } catch {
        // Network: try again.
      }
      await new Promise((resolve) => window.setTimeout(resolve, 2000 * 2 ** attempt))
    }
    this.update({ failed: this.state.failed + 1, error: `could not save ${track.name}` })
  }
}

export const listenRecorder = new ListenRecorder()
