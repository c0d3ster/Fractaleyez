import { Schema, model, Document, Types } from 'mongoose'

export interface IPack extends Document {
  name: string
  slug: string
  userId: string
  description?: string
  isPremium: boolean
  price?: number
  presetIds: Types.ObjectId[] // membership lives here; a preset can be in many packs
}

const packSchema = new Schema<IPack>({
  name: { type: String, required: true },
  slug: { type: String, required: true },
  userId: { type: String, required: true },
  description: { type: String },
  isPremium: { type: Boolean, default: false },
  price: { type: Number },
  presetIds: { type: [{ type: Schema.Types.ObjectId, ref: 'Preset' }], default: [] },
})

packSchema.index({ slug: 1 }, { unique: true })

export const Pack = model<IPack>('Pack', packSchema)
