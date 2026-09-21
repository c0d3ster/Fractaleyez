import { connectDB } from '../db'
import { User, IUser } from '../models/User'

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
}

export const userRepository = new UserRepository()
