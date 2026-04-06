import { Types } from 'mongoose'
import { connectDB } from '../db'
import { Preset, IPreset } from '../models/Preset'

export type PresetMeta = {
  _id: Types.ObjectId
  name: string
  pack?: string
  sprite: string
  userId?: string
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
    return Preset.find({}, 'name pack sprite userId').lean<PresetMeta[]>()
  }

  async findById(id: string): Promise<IPreset | null> {
    await connectDB()
    if (!Types.ObjectId.isValid(id)) return null
    return Preset.findById(id)
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
      { upsert: true, new: true }
    )
    if (!result) throw new Error('Upsert failed')
    return result
  }
}

export const presetRepository = new PresetRepository()
