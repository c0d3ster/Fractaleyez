import { connectDB } from '../db'
import { Preset, IPreset } from '../models/Preset'

export type PresetMeta = {
  name: string
  pack: string
  sprite: string
  userId?: string
}

export type UpsertData = {
  name: string
  pack: string
  sprite: string
  config: Record<string, unknown>
  userId: string
}

export class PresetRepository {
  async findAll(): Promise<PresetMeta[]> {
    await connectDB()
    return Preset.find({}, 'name pack sprite userId').lean<PresetMeta[]>()
  }

  async findByName(name: string): Promise<IPreset | null> {
    await connectDB()
    return Preset.findOne({ name })
  }

  async findOwned(name: string, userId: string): Promise<IPreset | null> {
    await connectDB()
    return Preset.findOne({ name, userId })
  }

  async upsert(data: UpsertData): Promise<IPreset> {
    await connectDB()
    const { name, userId, ...fields } = data
    const result = await Preset.findOneAndUpdate(
      { name, userId },
      { name, userId, ...fields },
      { upsert: true, new: true, runValidators: true }
    )
    if (!result) throw new Error('Upsert failed')
    return result
  }
}

export const presetRepository = new PresetRepository()
