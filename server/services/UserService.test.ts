import type { UserJSON } from '@clerk/backend'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { userRepository } from '../repositories/UserRepository'
import { IUser } from '../models/User'
import { resolveDisplayName, UserService } from './UserService'

const getUserMock = vi.fn()
vi.mock('@clerk/backend', async importOriginal => {
  const actual = await importOriginal<typeof import('@clerk/backend')>()
  return {
    ...actual,
    createClerkClient: () => ({ users: { getUser: getUserMock } }),
  }
})
vi.mock('../repositories/UserRepository', () => ({
  userRepository: { upsertByClerkId: vi.fn() },
}))
vi.mock('../env', () => ({
  requireEnv: { CLERK_SECRET_KEY: () => 'sk_test' },
}))

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

describe('UserService#getOrCreateUser', () => {
  const userService = new UserService()

  beforeEach(() => {
    getUserMock.mockReset()
    vi.mocked(userRepository.upsertByClerkId).mockReset()
  })

  it('returns the upserted user as-is when it already has a displayName', async () => {
    vi.mocked(userRepository.upsertByClerkId).mockResolvedValue(
      { displayName: 'Ada Lovelace' } as unknown as IUser,
    )
    const user = await userService.getOrCreateUser('user_1')
    expect(user.displayName).toBe('Ada Lovelace')
    expect(getUserMock).not.toHaveBeenCalled()
  })

  it('self-heals an empty displayName by re-checking Clerk (async custom-OAuth profile backfill)', async () => {
    vi.mocked(userRepository.upsertByClerkId)
      .mockResolvedValueOnce({ displayName: '' } as unknown as IUser)
      .mockResolvedValueOnce({ displayName: 'BeatzMe ster' } as unknown as IUser)
    getUserMock.mockResolvedValue({ raw: { ...baseUser, first_name: 'BeatzMe', last_name: 'ster' } })

    const user = await userService.getOrCreateUser('user_1')

    expect(getUserMock).toHaveBeenCalledWith('user_1')
    expect(userRepository.upsertByClerkId).toHaveBeenCalledWith('user_1', { displayName: 'BeatzMe ster' })
    expect(user.displayName).toBe('BeatzMe ster')
  })

  it('keeps the empty-name fallback when Clerk still has nothing to resolve', async () => {
    const fallback = { displayName: '' } as unknown as IUser
    vi.mocked(userRepository.upsertByClerkId).mockResolvedValueOnce(fallback)
    getUserMock.mockResolvedValue({ raw: baseUser })

    const user = await userService.getOrCreateUser('user_1')

    expect(user).toBe(fallback)
    expect(userRepository.upsertByClerkId).toHaveBeenCalledTimes(1)
  })

  it('keeps the empty-name fallback when the Clerk API call fails', async () => {
    const fallback = { displayName: '' } as unknown as IUser
    vi.mocked(userRepository.upsertByClerkId).mockResolvedValueOnce(fallback)
    getUserMock.mockRejectedValue(new Error('clerk unreachable'))

    const user = await userService.getOrCreateUser('user_1')

    expect(user).toBe(fallback)
  })
})
