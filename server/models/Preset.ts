import { Schema, model, Document } from 'mongoose'

interface IPreset extends Document {
  name: string
  pack: string
  sprite: string
  config: Record<string, unknown>
}

const presetSchema = new Schema<IPreset>({
  name: { type: String, required: true, unique: true },
  pack: { type: String, required: true },
  sprite: { type: String, required: true },
  config: { type: Schema.Types.Mixed, required: true },
})

export const Preset = model<IPreset>('Preset', presetSchema)
