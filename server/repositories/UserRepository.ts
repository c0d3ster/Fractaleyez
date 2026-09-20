import { connectDB } from '../db'
import { User, IUser } from '../models/User'

export type UserSyncFields = {
  displayName?: string
}

export class UserRepository {
  /**
   * Single atomic upsert keyed on clerkId -- a plain find-then-create would let two
   * concurrent first-requests (or a redelivered webhook racing a live request) both see
   * "not found" and both insert, tripping the unique index as a duplicate-key error instead
   * of converging on one document.
   */
  async upsertByClerkId(clerkId: string, fields: UserSyncFields): Promise<IUser> {
    await connectDB()
    const update: Record<string, unknown> = { $setOnInsert: { clerkId, settings: {} } }
    if (Object.keys(fields).length > 0) update.$set = fields

    const result = await User.findOneAndUpdate({ clerkId }, update, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    })
    if (!result) throw new Error('Upsert failed')
    return result
  }
}

export const userRepository = new UserRepository()
