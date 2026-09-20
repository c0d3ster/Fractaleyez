import { Schema, model, Document } from 'mongoose'

export type UserSettings = {
  crossfadeDurationMs?: number
  logoParticle?: string
  hud?: Record<string, unknown>
}

export interface IUser extends Document {
  clerkId: string
  displayName: string
  settings: UserSettings
  createdAt: Date
  updatedAt: Date
}

const userSettingsSchema = new Schema<UserSettings>({
  crossfadeDurationMs: { type: Number },
  logoParticle: { type: String },
  hud: { type: Schema.Types.Mixed },
}, { _id: false })

const userSchema = new Schema<IUser>({
  clerkId: { type: String, required: true },
  displayName: { type: String, default: '' },
  settings: { type: userSettingsSchema, default: () => ({}) },
}, { timestamps: true })

// Enforced at the DB level so concurrent lazy-creates can't race into duplicate documents.
userSchema.index({ clerkId: 1 }, { unique: true })

export const User = model<IUser>('User', userSchema)
