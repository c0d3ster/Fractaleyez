import { Schema, model, Document } from 'mongoose'

/**
 * A Spotify track the listening recorder has heard, once however many times it was played: what it is and its tempo. Labels for the
 * section model will live here too (by position in the track), so one labelling covers every listen.
 */
export interface ITrack extends Document {
  trackId: string
  name: string
  artists: string[]
  isrc: string | null
  durationMs: number
  /** Deezer's BPM for the ISRC; null when Deezer has none (it returns 0 for about a third of tracks) or the lookup failed. */
  deezerBpm: number | null
  deezerCheckedAt: Date | null
  /** The tempo confirmed by hand on the review page (Deezer's, doubled, halved or tapped). */
  confirmedBpm: number | null
  createdAt: Date
  updatedAt: Date
}

const trackSchema = new Schema<ITrack>({
  trackId: { type: String, required: true },
  name: { type: String, default: '' },
  artists: { type: [String], default: [] },
  isrc: { type: String, default: null },
  durationMs: { type: Number, required: true },
  deezerBpm: { type: Number, default: null },
  deezerCheckedAt: { type: Date, default: null },
  confirmedBpm: { type: Number, default: null },
}, { timestamps: true })

trackSchema.index({ trackId: 1 }, { unique: true })

export const Track = model<ITrack>('Track', trackSchema)
