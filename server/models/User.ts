import { Schema, model, Document } from 'mongoose'

export type UserSettings = {
  crossfadeDurationMs?: number
  logoParticle?: string
  skipRedZoneWarning?: boolean
  /** 'auto' or a fixed quality tier; mirrors src/config/quality.config.ts's QualitySetting. */
  quality?: string
  hud?: Record<string, unknown>
}

export interface IUser extends Document {
  clerkId: string
  displayName: string
  settings: UserSettings
  /** Top-level on purpose: `settings` is user-writable via PATCH /api/me. Only ever set directly in Mongo. */
  isAdmin: boolean
  createdAt: Date
  updatedAt: Date
}

const userSettingsSchema = new Schema<UserSettings>({
  crossfadeDurationMs: { type: Number },
  logoParticle: { type: String },
  skipRedZoneWarning: { type: Boolean },
  quality: { type: String },
  hud: { type: Schema.Types.Mixed },
}, { _id: false })

const userSchema = new Schema<IUser>({
  clerkId: { type: String, required: true },
  displayName: { type: String, default: '' },
  settings: { type: userSettingsSchema, default: () => ({}) },
  isAdmin: { type: Boolean, default: false },
}, { timestamps: true })

// Enforced at the DB level so concurrent lazy-creates can't race into duplicate documents.
userSchema.index({ clerkId: 1 }, { unique: true })

export const User = model<IUser>('User', userSchema)
