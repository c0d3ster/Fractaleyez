import type { Request, Response } from 'express'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AuthUnauthorizedError, verifyAuth } from '../auth.js'
import { storageService } from '../services/StorageService.js'
import { imageSize } from 'image-size'
import { uploadRepository } from '../repositories/UploadRepository.js'
import { userRepository } from '../repositories/UserRepository.js'
import { IUser, PlanId } from '../models/User.js'
import { uploadParticleHandler, MAX_UPLOAD_BYTES, MAX_DECODED_DIMENSION_PX } from './uploadParticleHandler.js'

// vi.mock calls are hoisted above these imports, so the imports above already resolve to the mocks.
vi.mock('../auth.js', () => ({
  AuthUnauthorizedError: class AuthUnauthorizedError extends Error {},
  verifyAuth: vi.fn(),
}))
vi.mock('../services/StorageService.js', () => ({
  storageService: {
    objectExists: vi.fn(),
    putObject: vi.fn(),
  },
}))
vi.mock('../repositories/UploadRepository.js', () => ({
  uploadRepository: { countByUserId: vi.fn(), create: vi.fn() },
}))
vi.mock('../repositories/UserRepository.js', () => ({
  userRepository: { findByClerkId: vi.fn() },
}))
vi.mock('../repositories/PresetRepository.js', () => ({ presetRepository: {} }))
vi.mock('../repositories/PackRepository.js', () => ({ packRepository: {} }))
vi.mock('image-size', () => ({
  imageSize: vi.fn(),
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

const makeReq = (body: unknown, authorization = 'Bearer valid-token', query: Record<string, string> = {}): Request =>
  ({ headers: { authorization }, body, query }) as unknown as Request

const asUser = (plan: PlanId): void => {
  vi.mocked(userRepository.findByClerkId).mockResolvedValue({ plan, isAdmin: false } as unknown as IUser)
}

// Counts per kind, as the upload records would hold them.
const withUploads = (sprite: number, avatar = 0): void => {
  vi.mocked(uploadRepository.countByUserId).mockImplementation(async (_userId, kind) => (kind === 'avatar' ? avatar : sprite))
}

describe('uploadParticleHandler', () => {
  beforeEach(() => {
    vi.mocked(verifyAuth).mockReset().mockResolvedValue('user_123')
    vi.mocked(storageService.objectExists).mockReset().mockResolvedValue(false)
    vi.mocked(storageService.putObject).mockReset().mockResolvedValue('https://cdn.example.com/particles/user_123/key.png')
    vi.mocked(imageSize).mockReset().mockReturnValue({ width: 64, height: 64, type: 'png' })
    vi.mocked(uploadRepository.create).mockReset()
    withUploads(0)
    asUser('free')
  })

  it('rejects when unauthenticated', async () => {
    vi.mocked(verifyAuth).mockRejectedValueOnce(new AuthUnauthorizedError())
    const res = makeRes()
    await uploadParticleHandler(makeReq(Buffer.from('x')), res)
    expect(res.statusCode).toBe(401)
  })

  it('rejects a non-buffer body', async () => {
    const res = makeRes()
    await uploadParticleHandler(makeReq('not-a-buffer'), res)
    expect(res.statusCode).toBe(400)
  })

  it('rejects a body over the max byte size', async () => {
    const res = makeRes()
    await uploadParticleHandler(makeReq(Buffer.alloc(MAX_UPLOAD_BYTES + 1)), res)
    expect(res.statusCode).toBe(413)
  })

  it('rejects an undecodable image', async () => {
    vi.mocked(imageSize).mockImplementationOnce(() => {
      throw new Error('unrecognized format')
    })
    const res = makeRes()
    await uploadParticleHandler(makeReq(Buffer.from('garbage')), res)
    expect(res.statusCode).toBe(400)
  })

  it('rejects a format outside the allowlist', async () => {
    vi.mocked(imageSize).mockReturnValueOnce({ width: 64, height: 64, type: 'bmp' })
    const res = makeRes()
    await uploadParticleHandler(makeReq(Buffer.from('bmp-bytes')), res)
    expect(res.statusCode).toBe(400)
  })

  it('rejects dimensions over the max decoded pixel size', async () => {
    vi.mocked(imageSize).mockReturnValueOnce({ width: MAX_DECODED_DIMENSION_PX + 1, height: 64, type: 'png' })
    const res = makeRes()
    await uploadParticleHandler(makeReq(Buffer.from('big-image')), res)
    expect(res.statusCode).toBe(400)
  })

  it('rejects an overwrite of an existing key', async () => {
    vi.mocked(storageService.objectExists).mockResolvedValueOnce(true)
    const res = makeRes()
    await uploadParticleHandler(makeReq(Buffer.from('valid-png-bytes')), res)
    expect(res.statusCode).toBe(409)
  })

  it('uploads a valid image scoped to the authenticated user and returns its URL', async () => {
    const res = makeRes()
    await uploadParticleHandler(makeReq(Buffer.from('valid-png-bytes')), res)

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ url: 'https://cdn.example.com/particles/user_123/key.png' })

    const [key, , contentType] = vi.mocked(storageService.putObject).mock.calls[0]!
    expect(key).toMatch(/^particles\/user_123\/[0-9a-f-]+\.png$/)
    expect(contentType).toBe('image/png')
  })

  it('records the upload against the user so it counts toward the quota', async () => {
    const res = makeRes()
    await uploadParticleHandler(makeReq(Buffer.from('valid-png-bytes')), res)
    expect(uploadRepository.create).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user_123', kind: 'sprite', url: 'https://cdn.example.com/particles/user_123/key.png' }))
  })

  it('refuses an upload over the plan limit with 403 and the quota details, and stores nothing', async () => {
    withUploads(3)
    const res = makeRes()
    await uploadParticleHandler(makeReq(Buffer.from('valid-png-bytes')), res)
    expect(res.statusCode).toBe(403)
    expect(res.body).toMatchObject({ code: 'quota_exceeded', quota: 'particleUploads', limit: 3, plan: 'free' })
    expect(storageService.putObject).not.toHaveBeenCalled()
    expect(uploadRepository.create).not.toHaveBeenCalled()
  })

  it('allows more uploads on Lucid', async () => {
    withUploads(3)
    asUser('tier1')
    const res = makeRes()
    await uploadParticleHandler(makeReq(Buffer.from('valid-png-bytes')), res)
    expect(res.statusCode).toBe(200)
  })

  it('lets the first avatar copy through at the limit without counting it', async () => {
    withUploads(3, 0)
    const res = makeRes()
    await uploadParticleHandler(makeReq(Buffer.from('valid-png-bytes'), undefined, { kind: 'avatar' }), res)
    expect(res.statusCode).toBe(200)
    expect(uploadRepository.create).toHaveBeenCalledWith(expect.objectContaining({ kind: 'avatar' }))
  })

  it('counts a second avatar as a sprite, so the kind cannot dodge the quota', async () => {
    withUploads(3, 1)
    const res = makeRes()
    await uploadParticleHandler(makeReq(Buffer.from('valid-png-bytes'), undefined, { kind: 'avatar' }), res)
    expect(res.statusCode).toBe(403)
  })
})
