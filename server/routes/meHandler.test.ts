import type { Request, Response } from 'express'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AuthUnauthorizedError, verifyAuth } from '../auth'
import { userService } from '../services/UserService'
import { IUser } from '../models/User'
import { meHandler } from './meHandler'

vi.mock('../auth', () => ({
  AuthUnauthorizedError: class AuthUnauthorizedError extends Error {},
  verifyAuth: vi.fn(),
}))
vi.mock('../services/UserService', () => ({
  userService: {
    getOrCreateUser: vi.fn(),
  },
}))

const makeRes = (): Response & { statusCode: number; body: unknown } => {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code
      return res
    },
    json(body: unknown) {
      res.body = body
      return res
    },
  }
  return res as unknown as Response & { statusCode: number; body: unknown }
}

const makeReq = (authorization = 'Bearer valid-token'): Request =>
  ({ headers: { authorization } }) as unknown as Request

describe('meHandler', () => {
  beforeEach(() => {
    vi.mocked(verifyAuth).mockReset().mockResolvedValue('user_123')
    vi.mocked(userService.getOrCreateUser).mockReset().mockResolvedValue({
      clerkId: 'user_123',
      displayName: 'Ada Lovelace',
      settings: {},
    } as unknown as IUser)
  })

  it('rejects when unauthenticated', async () => {
    vi.mocked(verifyAuth).mockRejectedValueOnce(new AuthUnauthorizedError())
    const res = makeRes()
    await meHandler(makeReq(), res)
    expect(res.statusCode).toBe(401)
    expect(userService.getOrCreateUser).not.toHaveBeenCalled()
  })

  it('lazily creates/fetches the user doc for the authenticated clerkId', async () => {
    const res = makeRes()
    await meHandler(makeReq(), res)
    expect(userService.getOrCreateUser).toHaveBeenCalledWith('user_123')
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ clerkId: 'user_123', displayName: 'Ada Lovelace', settings: {} })
  })

  it('returns 500 without leaking internals when the upsert fails', async () => {
    vi.mocked(userService.getOrCreateUser).mockRejectedValueOnce(new Error('mongo down'))
    const res = makeRes()
    await meHandler(makeReq(), res)
    expect(res.statusCode).toBe(500)
  })
})
