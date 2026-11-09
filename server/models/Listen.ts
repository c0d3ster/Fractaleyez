import { Schema, model, Document } from 'mongoose'

/** One reading of the Spotify player, as the app recorded it (src/spotify/player-sample.ts, compacted). */
export type ListenPlayerSample = {
  t: number
  trackId: string | null
  progressMs: number | null
  isPlaying: boolean
  volumePercent: number | null
  deviceName: string | null
  deviceType: string | null
  contextUri: string | null
  shuffle: boolean | null
  spotifyTimestamp: number | null
}

export type ListenSettings = {
  enabledBands: boolean[]
  sensitivity: number | null
  ignoreMs: number | null
}

/**
 * One song heard through the app's microphone while Spotify played it, for training the section model: the section tracker's 50 ms ticks
 * from a little before the song started to a little after it ended (src/audioanalysis/tick-encoding.ts), and every player reading in that
 * time. `songStartT`, `songEndT` and the readings' `t` are on the same clock as the ticks, so a tick's position in the song is known.
 */
export interface IListen extends Document {
  userId: string
  trackId: string
  trackName: string
  artists: string[]
  isrc: string | null
  durationMs: number
  startedAt: Date
  songStartT: number
  songEndT: number
  startProgressMs: number
  endProgressMs: number
  playedMs: number
  pausedMs: number
  seeks: number
  endReason: string
  contextUri: string | null
  deviceName: string | null
  deviceType: string | null
  tickFormat: number
  tickBytes: number
  tickMs: number
  tickCount: number
  spectrumEdgesHz: number[]
  ticks: Buffer
  player: ListenPlayerSample[]
  settings: ListenSettings
  createdAt: Date
  updatedAt: Date
}

const playerSampleSchema = new Schema<ListenPlayerSample>({
  t: { type: Number, required: true },
  trackId: { type: String, default: null },
  progressMs: { type: Number, default: null },
  isPlaying: { type: Boolean, required: true },
  volumePercent: { type: Number, default: null },
  deviceName: { type: String, default: null },
  deviceType: { type: String, default: null },
  contextUri: { type: String, default: null },
  shuffle: { type: Boolean, default: null },
  spotifyTimestamp: { type: Number, default: null },
}, { _id: false })

const settingsSchema = new Schema<ListenSettings>({
  enabledBands: { type: [Boolean], default: [] },
  sensitivity: { type: Number, default: null },
  ignoreMs: { type: Number, default: null },
}, { _id: false })

const listenSchema = new Schema<IListen>({
  userId: { type: String, required: true },
  trackId: { type: String, required: true },
  trackName: { type: String, default: '' },
  artists: { type: [String], default: [] },
  isrc: { type: String, default: null },
  durationMs: { type: Number, required: true },
  startedAt: { type: Date, required: true },
  songStartT: { type: Number, required: true },
  songEndT: { type: Number, required: true },
  startProgressMs: { type: Number, required: true },
  endProgressMs: { type: Number, required: true },
  playedMs: { type: Number, required: true },
  pausedMs: { type: Number, default: 0 },
  seeks: { type: Number, default: 0 },
  endReason: { type: String, required: true },
  contextUri: { type: String, default: null },
  deviceName: { type: String, default: null },
  deviceType: { type: String, default: null },
  tickFormat: { type: Number, required: true },
  tickBytes: { type: Number, required: true },
  tickMs: { type: Number, required: true },
  tickCount: { type: Number, required: true },
  spectrumEdgesHz: { type: [Number], default: [] },
  ticks: { type: Buffer, required: true },
  player: { type: [playerSampleSchema], default: [] },
  settings: { type: settingsSchema, default: () => ({}) },
}, { timestamps: true })

listenSchema.index({ userId: 1, startedAt: -1 })
listenSchema.index({ trackId: 1 })
// One save per song listen: a retried upload of the same listen replaces it instead of adding a copy.
listenSchema.index({ userId: 1, trackId: 1, startedAt: 1 }, { unique: true })

export const Listen = model<IListen>('Listen', listenSchema)
