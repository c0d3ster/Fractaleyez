import { connectDB } from '../db.js'
import { Upload, IUpload, UploadKind } from '../models/Upload.js'

export type CreateUploadData = {
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

  async create(data: CreateUploadData): Promise<IUpload> {
    await connectDB()
    return Upload.create(data)
  }
}

export const uploadRepository = new UploadRepository()
