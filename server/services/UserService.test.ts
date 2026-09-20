import type { UserJSON } from '@clerk/backend'
import { describe, it, expect } from 'vitest'
import { resolveDisplayName } from './UserService'

const baseUser = {
  id: 'user_1',
  username: null,
  first_name: null,
  last_name: null,
  external_accounts: [],
  email_addresses: [],
  primary_email_address_id: null,
} as unknown as UserJSON

describe('resolveDisplayName', () => {
  it('prefers native first/last name (Clerk-native provider, e.g. Google)', () => {
    const user = { ...baseUser, first_name: 'Ada', last_name: 'Lovelace' } as UserJSON
    expect(resolveDisplayName(user)).toBe('Ada Lovelace')
  })

  it('falls back to an external account username when no native name is set (custom OAuth provider, e.g. Spotify)', () => {
    const user = {
      ...baseUser,
      external_accounts: [{ provider: 'oauth_custom_spotify', username: 'ada_spotify', public_metadata: null }],
    } as unknown as UserJSON
    expect(resolveDisplayName(user)).toBe('ada_spotify')
  })

  it('falls back to public_metadata.display_name when the account has no username', () => {
    const user = {
      ...baseUser,
      external_accounts: [{ provider: 'oauth_custom_spotify', username: null, public_metadata: { display_name: 'Ada on Spotify' } }],
    } as unknown as UserJSON
    expect(resolveDisplayName(user)).toBe('Ada on Spotify')
  })

  it('falls back to the primary email local part when nothing else resolves', () => {
    const user = {
      ...baseUser,
      email_addresses: [{ id: 'email_1', email_address: 'ada@example.com' }],
      primary_email_address_id: 'email_1',
    } as unknown as UserJSON
    expect(resolveDisplayName(user)).toBe('ada')
  })

  it('returns an empty string when nothing at all is available', () => {
    expect(resolveDisplayName(baseUser)).toBe('')
  })
})
