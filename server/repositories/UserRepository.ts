import { connectDB } from '../db.js'
import { User, IUser, UserSettings, PlanId, UserBilling } from '../models/User.js'

export type UserSyncFields = {
  displayName?: string
}

export type BillingSyncFields = {
  plan: PlanId
  billing: Required<Pick<UserBilling, 'subscriptionId' | 'status' | 'cancelAtPeriodEnd'>> & Pick<UserBilling, 'currentPeriodEnd'>
}

const isDuplicateKeyError = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === 11000

export class UserRepository {
  async findByClerkId(clerkId: string): Promise<IUser | null> {
    await connectDB()
    return User.findOne({ clerkId })
  }

  /**
   * Single atomic upsert keyed on clerkId -- a plain find-then-create would let two
   * concurrent first-requests (or a redelivered webhook racing a live request) both see
   * "not found" and both insert, tripping the unique index as a duplicate-key error instead
   * of converging on one document. That race can still surface as a duplicate-key error on
   * the losing call (both see "not found" before either commits); retrying once resolves it
   * to the document the winner just created.
   */
  async upsertByClerkId(clerkId: string, fields: UserSyncFields): Promise<IUser> {
    await connectDB()
    const update: Record<string, unknown> = { $setOnInsert: { clerkId, settings: {} } }
    if (Object.keys(fields).length > 0) update.$set = fields

    try {
      const result = await User.findOneAndUpdate({ clerkId }, update, {
        upsert: true,
        returnDocument: 'after',
        setDefaultsOnInsert: true,
      })
      if (!result) throw new Error('Upsert failed')
      return result
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err
      const existing = await User.findOne({ clerkId })
      if (!existing) throw err
      return existing
    }
  }

  /**
   * Dot-notated $set on `settings.<key>` so a partial patch (e.g. just crossfadeDurationMs)
   * can't clobber sibling settings fields. Deliberately not folded into upsertByClerkId's
   * single $setOnInsert/$set update: `$setOnInsert: { settings: {} }` and `$set: {
   * 'settings.x': ... }` target overlapping paths, which MongoDB rejects as a conflict. A
   * settings PATCH should only ever race the lazy-create fired on sign-in (see meHandler),
   * so the plain-update-then-create-then-retry fallback below only exercises its second path
   * in that narrow race, not on every call.
   */
  async updateSettings(clerkId: string, settingsPatch: Partial<UserSettings>): Promise<IUser> {
    await connectDB()
    const set: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(settingsPatch)) {
      if (value !== undefined) set[`settings.${key}`] = value
    }
    if (Object.keys(set).length === 0) {
      return (await User.findOne({ clerkId })) ?? this.upsertByClerkId(clerkId, {})
    }

    const updated = await User.findOneAndUpdate({ clerkId }, { $set: set }, { returnDocument: 'after' })
    if (updated) return updated

    await this.upsertByClerkId(clerkId, {})
    const created = await User.findOneAndUpdate({ clerkId }, { $set: set }, { returnDocument: 'after' })
    if (!created) throw new Error('Failed to persist settings after creating user')
    return created
  }

  async findByStripeCustomerId(customerId: string): Promise<IUser | null> {
    await connectDB()
    return User.findOne({ 'billing.customerId': customerId })
  }

  /**
   * Links a Stripe customer to the user only if none is linked yet, and returns the customer id that ends up stored. Two
   * concurrent checkouts could each create a customer; the first write wins and the caller uses whatever this returns.
   */
  async linkStripeCustomer(clerkId: string, customerId: string): Promise<string> {
    await connectDB()
    const linked = await User.findOneAndUpdate(
      { clerkId, 'billing.customerId': { $exists: false } },
      { $set: { 'billing.customerId': customerId } },
      { returnDocument: 'after' },
    )
    if (linked?.billing?.customerId) return linked.billing.customerId
    const existing = await User.findOne({ clerkId })
    const existingCustomerId = existing?.billing?.customerId
    if (!existingCustomerId) throw new Error(`No user document for ${clerkId} to link a Stripe customer to`)
    return existingCustomerId
  }

  /**
   * Swaps a deleted Stripe customer for a new one, only if the user is still linked to the deleted one, and resets the plan:
   * deleting a customer cancels its subscriptions. Returns the customer id that ends up stored.
   */
  async replaceStripeCustomer(clerkId: string, fromCustomerId: string, toCustomerId: string): Promise<string> {
    await connectDB()
    const replaced = await User.findOneAndUpdate(
      { clerkId, 'billing.customerId': fromCustomerId },
      { $set: { plan: 'free', billing: { customerId: toCustomerId } } },
      { returnDocument: 'after' },
    )
    if (replaced?.billing?.customerId) return replaced.billing.customerId
    const current = (await User.findOne({ clerkId }))?.billing?.customerId
    if (!current) throw new Error(`No Stripe customer linked for ${clerkId} after replacing ${fromCustomerId}`)
    return current
  }

  /** Writes the plan and the subscription mirror. Dot-notated so customerId is never touched. */
  async syncBilling(customerId: string, { plan, billing }: BillingSyncFields): Promise<IUser | null> {
    await connectDB()
    const set: Record<string, unknown> = { plan }
    for (const [key, value] of Object.entries(billing)) {
      if (value !== undefined) set[`billing.${key}`] = value
    }
    const unset = billing.currentPeriodEnd === undefined ? { 'billing.currentPeriodEnd': '' } : undefined
    return User.findOneAndUpdate(
      { 'billing.customerId': customerId },
      unset ? { $set: set, $unset: unset } : { $set: set },
      { returnDocument: 'after' },
    )
  }
}

export const userRepository = new UserRepository()
