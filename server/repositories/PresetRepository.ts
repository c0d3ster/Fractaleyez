import { Types } from 'mongoose'
import { connectDB } from '../db.js'
import { Preset, IPreset } from '../models/Preset.js'

export type PresetMeta = {
  _id: Types.ObjectId
  name: string
  pack?: string
  sprite: string
  userId?: string
  updatedAt?: Date
}

export type UpsertData = {
  name: string
  pack?: string
  sprite: string
  config: Record<string, unknown>
  userId: string
}

export class PresetRepository {
  async findAll(): Promise<PresetMeta[]> {
    await connectDB()
    return Preset.find({}, '_id name pack sprite userId updatedAt').lean<PresetMeta[]>()
  }

  async findById(id: string): Promise<IPreset | null> {
    await connectDB()
    if (!Types.ObjectId.isValid(id)) return null
    return Preset.findById(id)
  }

  async countByUserId(userId: string): Promise<number> {
    await connectDB()
    return Preset.countDocuments({ userId })
  }

  async existsForUser(name: string, userId: string): Promise<boolean> {
    await connectDB()
    return (await Preset.exists({ name, userId })) !== null
  }

  async create(data: UpsertData): Promise<IPreset> {
    await connectDB()
    return Preset.create(data)
  }

  async upsert(data: UpsertData): Promise<IPreset> {
    await connectDB()
    const { name, userId, ...fields } = data
    const result = await Preset.findOneAndUpdate(
      { name, userId },
      { name, userId, ...fields },
      { upsert: true, returnDocument: 'after' }
    )
    if (!result) throw new Error('Upsert failed')
    return result
  }
}

export const presetRepository = new PresetRepository()
