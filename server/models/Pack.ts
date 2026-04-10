import { Schema, model, Document } from 'mongoose'

export interface IPack extends Document {
  name: string
  slug: string
  userId: string
  description?: string
  isPremium: boolean
  price?: number
}

const packSchema = new Schema<IPack>({
  name: { type: String, required: true },
  slug: { type: String, required: true },
  userId: { type: String, required: true },
  description: { type: String },
  isPremium: { type: Boolean, default: false },
  price: { type: Number },
})

packSchema.index({ slug: 1 }, { unique: true })

export const Pack = model<IPack>('Pack', packSchema)
