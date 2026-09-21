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
 * Google is Clerk-native: first_name/last_name/image_url are populated directly on the User
 * payload. Spotify is configured as a custom OAuth provider (not one of Clerk's built-in
 * social connections), so Clerk has no standard field mapping for it -- its external_accounts
 * entry is the only place its profile data can land, either in username or public_metadata
 * (Spotify's own API calls this field `display_name`). Confirmed against the type shape only;
 * see NEEDS HUMAN note for dashboard confirmation of Spotify's exact provider config.
 */
export const resolveDisplayName = (user: UserJSON): string => {
  const nativeName = [user.first_name, user.last_name].filter(Boolean).join(' ').trim()
  if (nativeName) return nativeName

  for (const account of user.external_accounts) {
    const accountName = [account.first_name, account.last_name].filter(Boolean).join(' ').trim()
    if (accountName) return accountName
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
