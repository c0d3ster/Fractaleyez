import type { Request, Response } from 'express'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AuthUnauthorizedError, verifyAuth } from '../auth.js'
import { BillingError, billingService } from '../services/BillingService.js'
import { billingActionHandler, billingStatusHandler } from './billingHandler.js'

vi.mock('../auth.js', () => ({
  AuthUnauthorizedError: class AuthUnauthorizedError extends Error {},
  verifyAuth: vi.fn(),
}))
vi.mock('../env.js', () => ({ env: {} }))
vi.mock('../services/BillingService.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/BillingService.js')>()
  return {
    ...actual,
    billingService: { getStatus: vi.fn(), createCheckoutSession: vi.fn(), createPortalSession: vi.fn() },
  }
})

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

const makeReq = (body: unknown = {}, origin: string | undefined = 'http://localhost:3000'): Request =>
  ({ headers: { authorization: 'Bearer valid-token', origin }, body }) as unknown as Request

describe('billingStatusHandler', () => {
  beforeEach(() => {
    vi.mocked(verifyAuth).mockReset().mockResolvedValue('user_1')
    vi.mocked(billingService.getStatus).mockReset()
  })

  it('rejects when unauthenticated', async () => {
    vi.mocked(verifyAuth).mockRejectedValueOnce(new AuthUnauthorizedError())
    const res = makeRes()
    await billingStatusHandler(makeReq(), res)
    expect(res.statusCode).toBe(401)
  })

  it('returns the billing status', async () => {
    const status = { plan: 'tier1', status: 'active', currentPeriodEnd: null, cancelAtPeriodEnd: false, canManageBilling: true }
    vi.mocked(billingService.getStatus).mockResolvedValueOnce(status as never)
    const res = makeRes()
    await billingStatusHandler(makeReq(), res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual(status)
  })
})

describe('billingActionHandler', () => {
  beforeEach(() => {
    vi.mocked(verifyAuth).mockReset().mockResolvedValue('user_1')
    vi.mocked(billingService.createCheckoutSession).mockReset().mockResolvedValue('https://checkout.stripe.com/x')
    vi.mocked(billingService.createPortalSession).mockReset().mockResolvedValue('https://billing.stripe.com/x')
  })

  it('creates a monthly checkout by default, returning to the page origin root', async () => {
    const res = makeRes()
    await billingActionHandler(makeReq({ action: 'checkout', plan: 'tier2' }), res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ url: 'https://checkout.stripe.com/x' })
    expect(billingService.createCheckoutSession).toHaveBeenCalledWith({ clerkId: 'user_1', plan: 'tier2', interval: 'monthly', returnUrl: 'http://localhost:3000/' })
  })

  it('validates the plan and interval', async () => {
    const badPlan = makeRes()
    await billingActionHandler(makeReq({ action: 'checkout', plan: 'free' }), badPlan)
    expect(badPlan.statusCode).toBe(400)

    const badInterval = makeRes()
    await billingActionHandler(makeReq({ action: 'checkout', plan: 'tier1', interval: 'weekly' }), badInterval)
    expect(badInterval.statusCode).toBe(400)
    expect(billingService.createCheckoutSession).not.toHaveBeenCalled()
  })

  it('opens the portal', async () => {
    const res = makeRes()
    await billingActionHandler(makeReq({ action: 'portal' }), res)
    expect(res.body).toEqual({ url: 'https://billing.stripe.com/x' })
    expect(billingService.createPortalSession).toHaveBeenCalledWith('user_1', 'http://localhost:3000/')
  })

  it('maps billing refusals to 409 with their code', async () => {
    vi.mocked(billingService.createCheckoutSession).mockRejectedValueOnce(new BillingError('already_subscribed', 'Already subscribed'))
    const res = makeRes()
    await billingActionHandler(makeReq({ action: 'checkout', plan: 'tier1' }), res)
    expect(res.statusCode).toBe(409)
    expect(res.body).toMatchObject({ code: 'already_subscribed' })
  })

  it('rejects an unknown action and a request with no usable origin', async () => {
    const unknown = makeRes()
    await billingActionHandler(makeReq({ action: 'refund' }), unknown)
    expect(unknown.statusCode).toBe(400)

    const noOrigin = makeRes()
    await billingActionHandler(makeReq({ action: 'portal' }, 'javascript:alert(1)'), noOrigin)
    expect(noOrigin.statusCode).toBe(400)
    expect(billingService.createPortalSession).not.toHaveBeenCalled()
  })
})
