import { Types } from 'mongoose'
import { connectDB } from '../db.js'
import { Pack, IPack } from '../models/Pack.js'
import type { PackOrigin } from '../models/Pack.js'

export type PackMeta = {
  _id: Types.ObjectId
  name: string
  slug: string
  userId?: string // absent on a built-in pack whose owner deleted their account
  description?: string
  isPremium: boolean
  price?: number
  origin?: PackOrigin // absent on packs stored before it existed: all owner-made, so read as builtIn
  presetIds?: Types.ObjectId[] // absent on packs written before membership moved here
}

export type CreatePackData = {
  name: string
  slug: string
  userId: string
  description?: string
  isPremium?: boolean
  price?: number
  origin: PackOrigin
}

export class PackRepository {
  async findAll(): Promise<PackMeta[]> {
    await connectDB()
    return Pack.find({}).lean<PackMeta[]>()
  }

  async findByUserId(userId: string): Promise<PackMeta[]> {
    await connectDB()
    return Pack.find({ userId }).lean<PackMeta[]>()
  }

  async countByUserId(userId: string): Promise<number> {
    await connectDB()
    return Pack.countDocuments({ userId })
  }

  /** Packs (of any owner) that list at least one of these presets. */
  async findContainingPresets(presetIds: Types.ObjectId[]): Promise<PackMeta[]> {
    await connectDB()
    if (presetIds.length === 0) return []
    return Pack.find({ presetIds: { $in: presetIds } }).lean<PackMeta[]>()
  }

  async deleteByIds(ids: Types.ObjectId[]): Promise<void> {
    await connectDB()
    if (ids.length === 0) return
    await Pack.deleteMany({ _id: { $in: ids } })
  }

  /** Removes the owner from packs that outlive their account. */
  async unlinkOwner(ids: Types.ObjectId[]): Promise<void> {
    await connectDB()
    if (ids.length === 0) return
    await Pack.updateMany({ _id: { $in: ids } }, { $unset: { userId: '' } })
  }

  /** Drops deleted presets from every pack's membership. */
  async removePresetsFromAll(presetIds: Types.ObjectId[]): Promise<void> {
    await connectDB()
    if (presetIds.length === 0) return
    await Pack.updateMany({ presetIds: { $in: presetIds } }, { $pull: { presetIds: { $in: presetIds } } })
  }

  async findBySlug(slug: string): Promise<IPack | null> {
    await connectDB()
    return Pack.findOne({ slug })
  }

  async create(data: CreatePackData): Promise<IPack> {
    await connectDB()
    return Pack.create(data)
  }
}

export const packRepository = new PackRepository()
