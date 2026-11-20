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

const isDuplicateKeyError = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === 11000

/** Presets with no owner: the seeded global ones, and kept presets whose owner deleted their account. */
const ownerless = { $or: [{ userId: { $exists: false } }, { userId: null }] }

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
   * Removes the owner from a preset that outlives their account. Without a userId it is unique by name among the global
   * presets, so on a name clash it is renamed with the end of its id.
   */
  async unlinkOwner(preset: Pick<PresetMeta, '_id' | 'name'>): Promise<void> {
    await connectDB()
    try {
      await Preset.updateOne({ _id: preset._id }, { $unset: { userId: '' } })
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err
      const name = `${preset.name} (${String(preset._id).slice(-6)})`
      await Preset.updateOne({ _id: preset._id }, { $unset: { userId: '' }, $set: { name } })
    }
  }

  /** Whether an ownerless preset shows this image, as its thumbnail or in its particle or logo sprites (either stored shape). */
  async ownerlessUsesSprite(url: string): Promise<boolean> {
    await connectDB()
    const usesUrl = [
      { sprite: url },
      { 'config.particle.sprites': url },
      { 'config.particle.sprites.value': url },
      { 'config.logo.sprite': url },
      { 'config.logo.sprite.value': url },
    ]
    return (await Preset.exists({ $and: [ownerless, { $or: usesUrl }] })) !== null
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
