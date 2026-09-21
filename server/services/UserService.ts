import type { UserJSON } from '@clerk/backend'
import { createClerkClient } from '@clerk/backend'
import { userRepository } from '../repositories/UserRepository'
import { requireEnv } from '../env'
import { IUser } from '../models/User'

let clerkClient: ReturnType<typeof createClerkClient> | null = null
const getClerkClient = (): ReturnType<typeof createClerkClient> => {
  clerkClient ??= createClerkClient({ secretKey: requireEnv.CLERK_SECRET_KEY() })
  return clerkClient
}

const primaryEmailLocalPart = (user: UserJSON): string | null => {
  const primary = user.email_addresses.find(e => e.id === user.primary_email_address_id)
  const address = primary?.email_address ?? user.email_addresses[0]?.email_address
  return address?.split('@')[0] ?? null
}

/**
 * First name only, never joined with last name. Custom OAuth providers with a single name
 * field (e.g. Spotify, including artist accounts) map their whole display name into
 * first_name with last_name left unset, so first_name alone already carries the full name
 * for those providers. Joining first+last also risked gluing together fields from two
 * different linked providers on the top-level user object (seen in practice: last_name
 * carried over from a separately-linked Google account while first_name reflected Spotify).
 */
export const resolveDisplayName = (user: UserJSON): string => {
  if (user.first_name) return user.first_name

  for (const account of user.external_accounts) {
    if (account.first_name) return account.first_name
    if (account.username) return account.username
    const metadataName = account.public_metadata?.display_name
    if (typeof metadataName === 'string' && metadataName) return metadataName
  }

  if (user.username) return user.username
  return primaryEmailLocalPart(user) ?? ''
}

export class UserService {
  async getOrCreateUser(clerkId: string): Promise<IUser> {
    const user = await userRepository.upsertByClerkId(clerkId, {})
    if (user.displayName) return user
    // Custom OAuth providers (e.g. Spotify) can populate their profile fields on the
    // Clerk user asynchronously, after the user.created webhook already fired with an
    // empty snapshot -- self-heal here instead of relying on a follow-up webhook landing.
    return this.reSyncDisplayNameFromClerk(clerkId, user)
  }

  private async reSyncDisplayNameFromClerk(clerkId: string, fallback: IUser): Promise<IUser> {
    try {
      const { raw } = await getClerkClient().users.getUser(clerkId)
      const displayName = raw ? resolveDisplayName(raw) : ''
      if (!displayName) return fallback
      return userRepository.upsertByClerkId(clerkId, { displayName })
    } catch (err) {
      console.error('Failed to self-heal displayName from Clerk', err)
      return fallback
    }
  }

  async syncFromClerk(user: UserJSON): Promise<IUser> {
    return userRepository.upsertByClerkId(user.id, { displayName: resolveDisplayName(user) })
  }
}

export const userService = new UserService()
