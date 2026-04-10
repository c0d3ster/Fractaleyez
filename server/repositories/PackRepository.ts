import { Types } from 'mongoose'
import { connectDB } from '../db'
import { Pack, IPack } from '../models/Pack'

export type PackMeta = {
  _id: Types.ObjectId
  name: string
  slug: string
  userId: string
  description?: string
  isPremium: boolean
  price?: number
}

export type CreatePackData = {
  name: string
  slug: string
  userId: string
  description?: string
  isPremium?: boolean
  price?: number
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
