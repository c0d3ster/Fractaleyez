import type { Request, Response } from 'express'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AuthUnauthorizedError, verifyAuth } from '../auth.js'
import { presetService } from '../services/PresetService.js'
import { PremiumPreviewError, QuotaExceededError } from '../services/EntitlementService.js'
import { IPreset } from '../models/Preset.js'
import { savePresetHandler } from './savePresetHandler.js'

vi.mock('../auth.js', () => ({
  AuthUnauthorizedError: class AuthUnauthorizedError extends Error {},
  verifyAuth: vi.fn(),
}))
vi.mock('../services/PresetService.js', () => ({
  presetService: { savePreset: vi.fn() },
  toUpdatedAt: (date?: Date): string | null => (date ? date.toISOString() : null),
}))

type TestResponse = Response & { statusCode: number; body: unknown }

const makeRes = (): TestResponse => {
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
  return res as unknown as TestResponse
}

const makeReq = (body: unknown): Request => ({ headers: { authorization: 'Bearer valid-token' }, body }) as unknown as Request

const post = async (body: unknown): Promise<TestResponse> => {
  const res = makeRes()
  await savePresetHandler(makeReq(body), res)
  return res
}

describe('savePresetHandler', () => {
  beforeEach(() => {
    vi.mocked(verifyAuth).mockReset().mockResolvedValue('user_1')
    vi.mocked(presetService.savePreset).mockReset().mockResolvedValue({ _id: 'p1', name: 'mine', updatedAt: new Date('2026-11-20T00:00:00.000Z') } as unknown as IPreset)
  })

  it('rejects when unauthenticated', async () => {
    vi.mocked(verifyAuth).mockRejectedValueOnce(new AuthUnauthorizedError())
    const res = await post({ name: 'mine' })
    expect(res.statusCode).toBe(401)
    expect(presetService.savePreset).not.toHaveBeenCalled()
  })

  it('passes the source preset id through to the service', async () => {
    const res = await post({ name: ' mine ', pack: 'Mine', config: { a: 1 }, sourcePresetId: 'src_1' })
    expect(res.statusCode).toBe(200)
    expect(presetService.savePreset).toHaveBeenCalledWith({ name: 'mine', pack: 'Mine', config: { a: 1 }, userId: 'user_1', force: false, sourcePresetId: 'src_1' })
  })

  it('ignores a missing, empty or non-string source id', async () => {
    for (const sourcePresetId of [undefined, '', 42, { $ne: null }]) {
      await post({ name: 'mine', sourcePresetId })
      expect(vi.mocked(presetService.savePreset).mock.lastCall?.[0].sourcePresetId).toBeUndefined()
    }
  })

  it('answers a save from a premium preview with 403 and code premium_preview', async () => {
    vi.mocked(presetService.savePreset).mockRejectedValueOnce(new PremiumPreviewError())
    const res = await post({ name: 'mine', sourcePresetId: 'src_1' })
    expect(res.statusCode).toBe(403)
    expect(res.body).toMatchObject({ code: 'premium_preview', error: expect.any(String) })
  })

  it('still answers a quota refusal with its details', async () => {
    vi.mocked(presetService.savePreset).mockRejectedValueOnce(new QuotaExceededError('savedPresets', 3, 'free'))
    const res = await post({ name: 'mine' })
    expect(res.statusCode).toBe(403)
    expect(res.body).toMatchObject({ code: 'quota_exceeded', quota: 'savedPresets', limit: 3, plan: 'free' })
  })
})
