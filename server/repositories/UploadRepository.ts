import { Types } from 'mongoose'
import { connectDB } from '../db.js'
import { Upload, IUpload, UploadKind } from '../models/Upload.js'

export type CreateUploadData = {
  userId: string
  key: string
  url: string
  kind: UploadKind
}

export type UploadMeta = {
  _id: Types.ObjectId
  userId: string
  key: string
  url: string
  kind: UploadKind
  createdAt: Date
}

export class UploadRepository {
  async countByUserId(userId: string, kind: UploadKind): Promise<number> {
    await connectDB()
    return Upload.countDocuments({ userId, kind })
  }

  async create(data: CreateUploadData): Promise<IUpload> {
    await connectDB()
    return Upload.create(data)
  }

  /** Newest first. `_id` breaks ties, so uploads made in the same millisecond keep a stable order. */
  async findByUserId(userId: string): Promise<UploadMeta[]> {
    await connectDB()
    return Upload.find({ userId }, '_id userId key url kind createdAt').sort({ createdAt: -1, _id: -1 }).lean<UploadMeta[]>()
  }

  async findById(id: string): Promise<UploadMeta | null> {
    await connectDB()
    if (!Types.ObjectId.isValid(id)) return null
    return Upload.findById(id, '_id userId key url kind createdAt').lean<UploadMeta>()
  }

  async deleteById(id: string): Promise<void> {
    await connectDB()
    await Upload.deleteOne({ _id: id })
  }
}

export const uploadRepository = new UploadRepository()
