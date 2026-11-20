import { Schema, model, Document, Types } from 'mongoose'

export const PACK_ORIGINS = ['builtIn', 'creator'] as const
export type PackOrigin = typeof PACK_ORIGINS[number]

export interface IPack extends Document {
  name: string
  slug: string
  userId: string
  description?: string
  isPremium: boolean
  price?: number
  /** builtIn: made by the owner (admin), included in paid plans. creator: made by a user. Missing on older packs, read as builtIn. */
  origin?: PackOrigin
  presetIds: Types.ObjectId[] // membership lives here; a preset can be in many packs
}

const packSchema = new Schema<IPack>({
  name: { type: String, required: true },
  slug: { type: String, required: true },
  userId: { type: String, required: true },
  description: { type: String },
  isPremium: { type: Boolean, default: false },
  price: { type: Number },
  origin: { type: String, enum: PACK_ORIGINS },
  presetIds: { type: [{ type: Schema.Types.ObjectId, ref: 'Preset' }], default: [] },
})

packSchema.index({ slug: 1 }, { unique: true })

export const Pack = model<IPack>('Pack', packSchema)
