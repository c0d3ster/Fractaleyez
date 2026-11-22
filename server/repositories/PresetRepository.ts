import { Types } from 'mongoose'
import { connectDB } from '../db.js'
import { Preset, IPreset } from '../models/Preset.js'
import { DELETED_USER_ID } from '../models/User.js'

export type PresetMeta = {
  _id: Types.ObjectId
  name: string
  pack?: string
  sprite: string
  userId?: string
  updatedAt?: Date
}

export type PresetConfigRow = {
  name: string
  config: Record<string, unknown>
}

const isDuplicateKeyError = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === 11000

/** Presets that outlive any account: the seeded global ones (no owner), and those kept after their owner deleted their account. */
const kept = { $or: [{ userId: { $exists: false } }, { userId: null }, { userId: DELETED_USER_ID }] }

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

  /** Name and config of every preset the user saved, for checks that read inside the config (which sprites it uses). */
  async findConfigsByUserId(userId: string): Promise<PresetConfigRow[]> {
    await connectDB()
    return Preset.find({ userId }, 'name config').lean<PresetConfigRow[]>()
  }

  async findByUserId(userId: string): Promise<PresetMeta[]> {
    await connectDB()
    return Preset.find({ userId }, '_id name pack sprite userId updatedAt').lean<PresetMeta[]>()
  }

  async deleteByIds(ids: Types.ObjectId[]): Promise<void> {
    await connectDB()
    if (ids.length === 0) return
    await Preset.deleteMany({ _id: { $in: ids } })
  }

  /**
   * Hands a preset that outlives its owner's account to the deleted-user marker. Names are unique per owner, so when another
   * deleted account already left a preset with this name, it is renamed with the end of its id.
   */
  async markOwnerDeleted(preset: Pick<PresetMeta, '_id' | 'name'>): Promise<void> {
    await connectDB()
    try {
      await Preset.updateOne({ _id: preset._id }, { $set: { userId: DELETED_USER_ID } })
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err
      const name = `${preset.name} (${String(preset._id).slice(-6)})`
      await Preset.updateOne({ _id: preset._id }, { $set: { userId: DELETED_USER_ID, name } })
    }
  }

  /** Whether a kept or global preset shows this image, as its thumbnail or in its particle or logo sprites (either stored shape). */
  async keptPresetUsesSprite(url: string): Promise<boolean> {
    await connectDB()
    const usesUrl = [
      { sprite: url },
      { 'config.particle.sprites': url },
      { 'config.particle.sprites.value': url },
      { 'config.logo.sprite': url },
      { 'config.logo.sprite.value': url },
    ]
    return (await Preset.exists({ $and: [kept, { $or: usesUrl }] })) !== null
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
