import { Schema, model, Document } from 'mongoose'

/** Stored plan ids. Neutral on purpose: the display names (Dream, Lucid, Third Eye) live in src/config/plans.config.ts, so a rename never touches the data. */
export const PLAN_IDS = ['free', 'tier1', 'tier2'] as const
export type PlanId = typeof PLAN_IDS[number]
export type PaidPlanId = Exclude<PlanId, 'free'>

export const isPaidPlanId = (value: unknown): value is PaidPlanId => value === 'tier1' || value === 'tier2'

/** Mirror of the user's Stripe subscription, written only by the Stripe webhook (BillingService.syncSubscription). */
export type UserBilling = {
  customerId?: string
  subscriptionId?: string
  /** Stripe's subscription status (active, past_due, canceled, ...). */
  status?: string
  currentPeriodEnd?: Date
  cancelAtPeriodEnd?: boolean
}

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
  /** Server-written only, like isAdmin. Set by the Stripe webhook, or by hand in Mongo for testing. */
  plan: PlanId
  billing: UserBilling
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

const userBillingSchema = new Schema<UserBilling>({
  customerId: { type: String },
  subscriptionId: { type: String },
  status: { type: String },
  currentPeriodEnd: { type: Date },
  cancelAtPeriodEnd: { type: Boolean },
}, { _id: false })

const userSchema = new Schema<IUser>({
  clerkId: { type: String, required: true },
  displayName: { type: String, default: '' },
  settings: { type: userSettingsSchema, default: () => ({}) },
  isAdmin: { type: Boolean, default: false },
  plan: { type: String, enum: PLAN_IDS, default: 'free' },
  billing: { type: userBillingSchema, default: () => ({}) },
}, { timestamps: true })

// Enforced at the DB level so concurrent lazy-creates can't race into duplicate documents.
userSchema.index({ clerkId: 1 }, { unique: true })
// The webhook finds the user by their Stripe customer. Sparse: most users never have one.
userSchema.index({ 'billing.customerId': 1 }, { unique: true, sparse: true })

export const User = model<IUser>('User', userSchema)
