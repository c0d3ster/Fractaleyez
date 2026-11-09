import type { Document } from 'mongoose'
import { connectDB } from '../db'
import { IListen, Listen } from '../models/Listen'
import { ITrack, Track } from '../models/Track'

export type ListenData = Omit<IListen, keyof Document | 'createdAt' | 'updatedAt'>

export type TrackData = Pick<ITrack, 'trackId' | 'name' | 'artists' | 'isrc' | 'durationMs'>

export class ListenRepository {
  /** Inserts the listen, or replaces the one with the same user, track and start (a retried upload). */
  async upsertListen(data: ListenData): Promise<IListen> {
    await connectDB()
    const { userId, trackId, startedAt } = data
    const result = await Listen.findOneAndReplace({ userId, trackId, startedAt }, data, { upsert: true, returnDocument: 'after' })
    if (!result) throw new Error('Listen upsert failed')
    return result
  }

  /** Creates the track on first hearing, and keeps its name, artists and ISRC current. */
  async upsertTrack(data: TrackData): Promise<ITrack> {
    await connectDB()
    const result = await Track.findOneAndUpdate({ trackId: data.trackId }, { $set: data }, { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true })
    if (!result) throw new Error('Track upsert failed')
    return result
  }

  async setDeezerBpm(trackId: string, bpm: number | null): Promise<void> {
    await connectDB()
    await Track.updateOne({ trackId }, { $set: { deezerBpm: bpm, deezerCheckedAt: new Date() } })
  }
}

export const listenRepository = new ListenRepository()
