import { connectDB } from '../db'
import { User, IUser, UserSettings } from '../models/User'

export type UserSyncFields = {
  displayName?: string
}

const isDuplicateKeyError = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === 11000

export class UserRepository {
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
}

export const userRepository = new UserRepository()
