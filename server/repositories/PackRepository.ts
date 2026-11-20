import { Types } from 'mongoose'
import { connectDB } from '../db.js'
import { Pack, IPack } from '../models/Pack.js'
import type { PackOrigin } from '../models/Pack.js'
import { DELETED_USER_ID } from '../models/User.js'

export type PackMeta = {
  _id: Types.ObjectId
  name: string
  slug: string
  userId: string // DELETED_USER_ID on a pack kept after its owner deleted their account
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

  /** Hands packs that outlive their owner's account to the deleted-user marker. */
  async markOwnerDeleted(ids: Types.ObjectId[]): Promise<void> {
    await connectDB()
    if (ids.length === 0) return
    await Pack.updateMany({ _id: { $in: ids } }, { $set: { userId: DELETED_USER_ID } })
  }

  /** Drops deleted presets from every pack's membership. */
  async removePresetsFromAll(presetIds: Types.ObjectId[]): Promise<void> {
    await connectDB()
    if (presetIds.length === 0) return
    await Pack.updateMany({ presetIds: { $in: presetIds } }, { $pull: { presetIds: { $in: presetIds } } })
  }

  /** The packs whose membership lists this preset. */
  async findByPresetId(presetId: Types.ObjectId | string): Promise<PackMeta[]> {
    await connectDB()
    return Pack.find({ presetIds: presetId }).lean<PackMeta[]>()
  }

  /** Packs by name, for a preset that only has the legacy `pack` string. */
  async findByName(name: string): Promise<PackMeta[]> {
    await connectDB()
    return Pack.find({ name }).lean<PackMeta[]>()
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
