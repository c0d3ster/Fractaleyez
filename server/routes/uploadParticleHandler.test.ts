import type { Request, Response } from 'express'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AuthUnauthorizedError, verifyAuth } from '../auth'
import { storageService } from '../services/StorageService'
import { imageSize } from 'image-size'
import { uploadParticleHandler, MAX_UPLOAD_BYTES, MAX_DECODED_DIMENSION_PX } from './uploadParticleHandler'

// vi.mock calls are hoisted above these imports, so the imports above already resolve to the mocks.
vi.mock('../auth', () => ({
  AuthUnauthorizedError: class AuthUnauthorizedError extends Error {},
  verifyAuth: vi.fn(),
}))
vi.mock('../services/StorageService', () => ({
  storageService: {
    objectExists: vi.fn(),
    putObject: vi.fn(),
  },
}))
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

const makeReq = (body: unknown, authorization = 'Bearer valid-token'): Request =>
  ({ headers: { authorization }, body }) as unknown as Request

describe('uploadParticleHandler', () => {
  beforeEach(() => {
    vi.mocked(verifyAuth).mockReset().mockResolvedValue('user_123')
    vi.mocked(storageService.objectExists).mockReset().mockResolvedValue(false)
    vi.mocked(storageService.putObject).mockReset().mockResolvedValue('https://cdn.example.com/particles/user_123/key.png')
    vi.mocked(imageSize).mockReset().mockReturnValue({ width: 64, height: 64, type: 'png' })
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
})
