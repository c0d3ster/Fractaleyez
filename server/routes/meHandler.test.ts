import type { Request, Response } from 'express'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AuthUnauthorizedError, verifyAuth } from '../auth'
import { userService } from '../services/UserService'
import { IUser } from '../models/User'
import { meHandler, updateMeHandler } from './meHandler'

vi.mock('../auth', () => ({
  AuthUnauthorizedError: class AuthUnauthorizedError extends Error {},
  verifyAuth: vi.fn(),
}))
vi.mock('../services/UserService', () => ({
  userService: {
    getOrCreateUser: vi.fn(),
    updateSettings: vi.fn(),
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

const makeReq = (authorization = 'Bearer valid-token', body: unknown = {}): Request =>
  ({ headers: { authorization }, body }) as unknown as Request

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

describe('updateMeHandler', () => {
  beforeEach(() => {
    vi.mocked(verifyAuth).mockReset().mockResolvedValue('user_123')
    vi.mocked(userService.updateSettings).mockReset().mockResolvedValue({
      clerkId: 'user_123',
      displayName: 'Ada Lovelace',
      settings: { crossfadeDurationMs: 500 },
    } as unknown as IUser)
  })

  it('rejects when unauthenticated', async () => {
    vi.mocked(verifyAuth).mockRejectedValueOnce(new AuthUnauthorizedError())
    const res = makeRes()
    await updateMeHandler(makeReq(undefined, { crossfadeDurationMs: 500 }), res)
    expect(res.statusCode).toBe(401)
    expect(userService.updateSettings).not.toHaveBeenCalled()
  })

  it('persists a valid crossfadeDurationMs patch', async () => {
    const res = makeRes()
    await updateMeHandler(makeReq(undefined, { crossfadeDurationMs: 500 }), res)
    expect(userService.updateSettings).toHaveBeenCalledWith('user_123', { crossfadeDurationMs: 500 })
    expect(res.statusCode).toBe(200)
  })

  it('rejects a crossfadeDurationMs outside the allowed range', async () => {
    const res = makeRes()
    await updateMeHandler(makeReq(undefined, { crossfadeDurationMs: 50 }), res)
    expect(res.statusCode).toBe(400)
    expect(userService.updateSettings).not.toHaveBeenCalled()
  })

  it('rejects a data: URL for logoParticle', async () => {
    const res = makeRes()
    await updateMeHandler(makeReq(undefined, { logoParticle: 'data:image/png;base64,abc' }), res)
    expect(res.statusCode).toBe(400)
    expect(userService.updateSettings).not.toHaveBeenCalled()
  })

  it('accepts a valid logoParticle URL', async () => {
    const res = makeRes()
    await updateMeHandler(makeReq(undefined, { logoParticle: 'https://cdn.example.com/logo.png' }), res)
    expect(userService.updateSettings).toHaveBeenCalledWith('user_123', { logoParticle: 'https://cdn.example.com/logo.png' })
    expect(res.statusCode).toBe(200)
  })

  it('accepts a valid hud.enabledFreqBands patch', async () => {
    const res = makeRes()
    await updateMeHandler(makeReq(undefined, { hud: { enabledFreqBands: [true, false] } }), res)
    expect(userService.updateSettings).toHaveBeenCalledWith('user_123', { hud: { enabledFreqBands: [true, false] } })
    expect(res.statusCode).toBe(200)
  })

  it('rejects a hud payload with non-boolean band entries', async () => {
    const res = makeRes()
    await updateMeHandler(makeReq(undefined, { hud: { enabledFreqBands: ['yes'] } }), res)
    expect(res.statusCode).toBe(400)
    expect(userService.updateSettings).not.toHaveBeenCalled()
  })

  it('rejects an empty patch', async () => {
    const res = makeRes()
    await updateMeHandler(makeReq(undefined, {}), res)
    expect(res.statusCode).toBe(400)
    expect(userService.updateSettings).not.toHaveBeenCalled()
  })

  it('returns 500 without leaking internals when the update fails', async () => {
    vi.mocked(userService.updateSettings).mockRejectedValueOnce(new Error('mongo down'))
    const res = makeRes()
    await updateMeHandler(makeReq(undefined, { crossfadeDurationMs: 500 }), res)
    expect(res.statusCode).toBe(500)
  })
})
