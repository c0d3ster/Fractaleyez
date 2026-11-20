import { Schema, model, Document } from 'mongoose'

/** `avatar` is the copy of the Clerk profile photo made once per account for the `@user` logo; it does not count as an upload. */
export const UPLOAD_KINDS = ['sprite', 'avatar'] as const
export type UploadKind = typeof UPLOAD_KINDS[number]

export const isUploadKind = (value: unknown): value is UploadKind =>
  typeof value === 'string' && (UPLOAD_KINDS as readonly string[]).includes(value)

/**
 * One image a user put in R2. Kept so the upload quota is a count. Account deletion removes the record and the object, except an
 * image still used by kept content, whose record stays without its `userId`.
 */
export interface IUpload extends Document {
  userId?: string
  key: string
  url: string
  kind: UploadKind
  createdAt: Date
}

const uploadSchema = new Schema<IUpload>({
  userId: { type: String },
  key: { type: String, required: true },
  url: { type: String, required: true },
  kind: { type: String, enum: UPLOAD_KINDS, default: 'sprite' },
}, { timestamps: { createdAt: true, updatedAt: false } })

uploadSchema.index({ userId: 1, kind: 1 })
uploadSchema.index({ key: 1 }, { unique: true })

export const Upload = model<IUpload>('Upload', uploadSchema)
