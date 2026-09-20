import type { UserJSON } from '@clerk/backend'
import { userRepository } from '../repositories/UserRepository'
import { IUser, UserSettings } from '../models/User'

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
    return userRepository.upsertByClerkId(clerkId, {})
  }

  async syncFromClerk(user: UserJSON): Promise<IUser> {
    return userRepository.upsertByClerkId(user.id, { displayName: resolveDisplayName(user) })
  }

  async updateSettings(clerkId: string, patch: Partial<UserSettings>): Promise<IUser> {
    return userRepository.updateSettings(clerkId, patch)
  }
}

export const userService = new UserService()
