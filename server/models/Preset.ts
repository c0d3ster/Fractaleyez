import { Schema, model, Document } from 'mongoose'

export interface IPreset extends Document {
  name: string
  pack?: string
  sprite: string
  config: Record<string, unknown>
  userId?: string
  updatedAt?: Date // set by `timestamps`; legacy documents have none until they are next written
}

const presetSchema = new Schema<IPreset>({
  name: { type: String, required: true },
  pack: { type: String, default: '' },
  sprite: { type: String, required: true },
  config: { type: Schema.Types.Mixed, required: true },
  userId: { type: String },
}, { timestamps: true })

// Unique per user — seeded presets have no userId so they're unique by name alone
presetSchema.index({ name: 1, userId: 1 }, { unique: true })

export const Preset = model<IPreset>('Preset', presetSchema)
