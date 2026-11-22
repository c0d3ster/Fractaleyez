import type { Request, Response } from 'express'
import { Types } from 'mongoose'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AuthUnauthorizedError, verifyAuth } from '../auth.js'
import { storageService } from '../services/StorageService.js'
import { uploadRepository, UploadMeta } from '../repositories/UploadRepository.js'
import { presetRepository } from '../repositories/PresetRepository.js'
import { userRepository } from '../repositories/UserRepository.js'
import { IUser } from '../models/User.js'
import { listUploadsHandler, deleteUploadHandler } from './uploadsHandler.js'

// The real UploadService and PresetService run against these mocks, so the tests cover the ownership and in-use rules.
vi.mock('../auth.js', () => ({
  AuthUnauthorizedError: class AuthUnauthorizedError extends Error {},
  verifyAuth: vi.fn(),
}))
vi.mock('../services/StorageService.js', () => ({
  storageService: { deleteObject: vi.fn() },
}))
vi.mock('../repositories/UploadRepository.js', () => ({
  uploadRepository: { findByUserId: vi.fn(), findById: vi.fn(), deleteById: vi.fn(), countByUserId: vi.fn() },
}))
vi.mock('../repositories/PresetRepository.js', () => ({
  presetRepository: { findConfigsByUserId: vi.fn() },
}))
vi.mock('../repositories/UserRepository.js', () => ({
  userRepository: { findByClerkId: vi.fn() },
}))
vi.mock('../repositories/PackRepository.js', () => ({ packRepository: {} }))

type TestRes = Response & { statusCode: number; body: unknown; ended: boolean }

const makeRes = (): TestRes => {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    ended: false,
    status(code: number) {
      res.statusCode = code
      return res
    },
    json(body: unknown) {
      res.body = body
      return res
    },
    end() {
      res.ended = true
      return res
    },
  }
  return res as unknown as TestRes
}

const makeReq = (params: Record<string, string> = {}, authorization = 'Bearer valid-token'): Request =>
  ({ headers: { authorization }, params, query: {} }) as unknown as Request

const URL_A = 'https://cdn.example.com/particles/user_1/a.png'

const upload = (overrides: Partial<UploadMeta> = {}): UploadMeta => ({
  _id: new Types.ObjectId('65f000000000000000000001'),
  userId: 'user_1',
  key: 'particles/user_1/a.png',
  url: URL_A,
  kind: 'sprite',
  createdAt: new Date('2026-11-01T10:00:00.000Z'),
  ...overrides,
})

const withSettings = (settings: Partial<IUser['settings']>): void => {
  vi.mocked(userRepository.findByClerkId).mockResolvedValue({ clerkId: 'user_1', settings } as unknown as IUser)
}

beforeEach(() => {
  vi.mocked(verifyAuth).mockReset().mockResolvedValue('user_1')
  vi.mocked(storageService.deleteObject).mockReset().mockResolvedValue()
  vi.mocked(uploadRepository.findByUserId).mockReset().mockResolvedValue([])
  vi.mocked(uploadRepository.findById).mockReset().mockResolvedValue(upload())
  vi.mocked(uploadRepository.deleteById).mockReset().mockResolvedValue()
  vi.mocked(presetRepository.findConfigsByUserId).mockReset().mockResolvedValue([])
  withSettings({})
})

describe('listUploadsHandler', () => {
  it('needs a signed-in user', async () => {
    vi.mocked(verifyAuth).mockRejectedValue(new AuthUnauthorizedError('no token'))
    const res = makeRes()
    await listUploadsHandler(makeReq(), res)
    expect(res.statusCode).toBe(401)
    expect(uploadRepository.findByUserId).not.toHaveBeenCalled()
  })

  it("lists the caller's uploads in the repository's order, as id, url, kind and createdAt", async () => {
    vi.mocked(uploadRepository.findByUserId).mockResolvedValue([
      upload({ _id: new Types.ObjectId('65f000000000000000000002'), url: 'https://cdn.example.com/b.png', createdAt: new Date('2026-11-02T10:00:00.000Z') }),
      upload({ kind: 'avatar' }),
    ])
    const res = makeRes()
    await listUploadsHandler(makeReq(), res)
    expect(uploadRepository.findByUserId).toHaveBeenCalledWith('user_1')
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({
      uploads: [
        { id: '65f000000000000000000002', url: 'https://cdn.example.com/b.png', kind: 'sprite', createdAt: '2026-11-02T10:00:00.000Z' },
        { id: '65f000000000000000000001', url: URL_A, kind: 'avatar', createdAt: '2026-11-01T10:00:00.000Z' },
      ],
    })
  })
})

describe('deleteUploadHandler', () => {
  it('needs a signed-in user', async () => {
    vi.mocked(verifyAuth).mockRejectedValue(new AuthUnauthorizedError('no token'))
    const res = makeRes()
    await deleteUploadHandler(makeReq({ id: '65f000000000000000000001' }), res)
    expect(res.statusCode).toBe(401)
    expect(storageService.deleteObject).not.toHaveBeenCalled()
  })

  it('deletes the R2 object and then the record, freeing the quota slot', async () => {
    const res = makeRes()
    await deleteUploadHandler(makeReq({ id: '65f000000000000000000001' }), res)
    expect(res.statusCode).toBe(204)
    expect(res.ended).toBe(true)
    expect(storageService.deleteObject).toHaveBeenCalledWith('particles/user_1/a.png')
    expect(uploadRepository.deleteById).toHaveBeenCalledWith('65f000000000000000000001')
    expect(vi.mocked(storageService.deleteObject).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(uploadRepository.deleteById).mock.invocationCallOrder[0] ?? 0)
  })

  it("answers 404 for someone else's upload and leaves it alone", async () => {
    vi.mocked(uploadRepository.findById).mockResolvedValue(upload({ userId: 'user_2' }))
    const res = makeRes()
    await deleteUploadHandler(makeReq({ id: '65f000000000000000000001' }), res)
    expect(res.statusCode).toBe(404)
    expect(storageService.deleteObject).not.toHaveBeenCalled()
    expect(uploadRepository.deleteById).not.toHaveBeenCalled()
  })

  it('answers 404 for an unknown id', async () => {
    vi.mocked(uploadRepository.findById).mockResolvedValue(null)
    const res = makeRes()
    await deleteUploadHandler(makeReq({ id: 'nope' }), res)
    expect(res.statusCode).toBe(404)
  })

  it.each([
    ['particle sprites, bare array', { particle: { sprites: ['x.png', URL_A] } }],
    ['particle sprites, { value } item', { particle: { sprites: { value: [URL_A] } } }],
    ['logo sprite, bare array', { logo: { sprite: [URL_A] } }],
    ['logo sprite, { value } item', { logo: { sprite: { value: [URL_A] } } }],
  ])('refuses with 409 while a saved preset uses it (%s)', async (_shape, config) => {
    vi.mocked(presetRepository.findConfigsByUserId).mockResolvedValue([
      { name: 'Night drive', config },
      { name: 'Unrelated', config: { particle: { sprites: ['other.png'] } } },
    ])
    const res = makeRes()
    await deleteUploadHandler(makeReq({ id: '65f000000000000000000001' }), res)
    expect(presetRepository.findConfigsByUserId).toHaveBeenCalledWith('user_1')
    expect(res.statusCode).toBe(409)
    expect(res.body).toEqual({ error: 'Used in Night drive', code: 'upload_in_use', presets: ['Night drive'], logo: false })
    expect(storageService.deleteObject).not.toHaveBeenCalled()
    expect(uploadRepository.deleteById).not.toHaveBeenCalled()
  })

  it("refuses with 409 while it is the user's logo", async () => {
    withSettings({ logoParticle: URL_A })
    const res = makeRes()
    await deleteUploadHandler(makeReq({ id: '65f000000000000000000001' }), res)
    expect(res.statusCode).toBe(409)
    expect(res.body).toEqual({ error: 'Used in your logo', code: 'upload_in_use', presets: [], logo: true })
    expect(storageService.deleteObject).not.toHaveBeenCalled()
  })

  it('names every use at once', async () => {
    withSettings({ logoParticle: URL_A })
    vi.mocked(presetRepository.findConfigsByUserId).mockResolvedValue([
      { name: 'One', config: { particle: { sprites: [URL_A] } } },
      { name: 'Two', config: { logo: { sprite: [URL_A] } } },
    ])
    const res = makeRes()
    await deleteUploadHandler(makeReq({ id: '65f000000000000000000001' }), res)
    expect(res.body).toMatchObject({ error: 'Used in your logo, One, Two', presets: ['One', 'Two'], logo: true })
  })

  it('keeps the record when the R2 delete fails, so a retry can finish it', async () => {
    vi.mocked(storageService.deleteObject).mockRejectedValue(new Error('R2 down'))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const res = makeRes()
    await deleteUploadHandler(makeReq({ id: '65f000000000000000000001' }), res)
    expect(res.statusCode).toBe(500)
    expect(uploadRepository.deleteById).not.toHaveBeenCalled()
  })
})
