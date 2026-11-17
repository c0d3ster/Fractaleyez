import { Types } from 'mongoose'
import { connectDB } from '../db.js'
import { Pack, IPack } from '../models/Pack.js'
import type { PackOrigin } from '../models/Pack.js'

export type PackMeta = {
  _id: Types.ObjectId
  name: string
  slug: string
  userId: string
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
