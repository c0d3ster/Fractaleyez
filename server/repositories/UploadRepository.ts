import { Types } from 'mongoose'
import { connectDB } from '../db.js'
import { Upload, IUpload, UploadKind } from '../models/Upload.js'
import { DELETED_USER_ID } from '../models/User.js'

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
}

export class UploadRepository {
  async countByUserId(userId: string, kind: UploadKind): Promise<number> {
    await connectDB()
    return Upload.countDocuments({ userId, kind })
  }

  async findByUserId(userId: string): Promise<UploadMeta[]> {
    await connectDB()
    return Upload.find({ userId }).lean<UploadMeta[]>()
  }

  async deleteById(id: Types.ObjectId): Promise<void> {
    await connectDB()
    await Upload.deleteOne({ _id: id })
  }

  /** Keeps the record of an image kept content still uses, handed to the deleted-user marker. */
  async markOwnerDeleted(id: Types.ObjectId): Promise<void> {
    await connectDB()
    await Upload.updateOne({ _id: id }, { $set: { userId: DELETED_USER_ID } })
  }

  async create(data: CreateUploadData): Promise<IUpload> {
    await connectDB()
    return Upload.create(data)
  }
}

export const uploadRepository = new UploadRepository()
