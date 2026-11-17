import type { Request, Response } from 'express'
import Stripe from 'stripe'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { billingService } from '../services/BillingService.js'
import { stripeWebhookHandler } from './stripeWebhookHandler.js'

const WEBHOOK_SECRET = 'whsec_test_secret'

vi.mock('../env.js', () => ({ env: { STRIPE_WEBHOOK_SECRET: 'whsec_test_secret' } }))
// A real client (no network: constructEvent only checks the HMAC locally), so the test covers actual signature verification.
vi.mock('../stripe.js', () => ({ getStripe: (): Stripe => new Stripe('sk_test_dummy') }))
vi.mock('../services/BillingService.js', () => ({ billingService: { handleEvent: vi.fn() } }))

const stripe = new Stripe('sk_test_dummy')

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

const eventPayload = JSON.stringify({ id: 'evt_1', object: 'event', type: 'customer.subscription.updated', data: { object: { id: 'sub_1' } } })

const signedReq = (payload = eventPayload, secret = WEBHOOK_SECRET): Request =>
  ({
    headers: { 'stripe-signature': stripe.webhooks.generateTestHeaderString({ payload, secret }) },
    body: Buffer.from(payload),
  }) as unknown as Request

describe('stripeWebhookHandler', () => {
  beforeEach(() => {
    vi.mocked(billingService.handleEvent).mockReset().mockResolvedValue(undefined)
  })

  it('verifies the signature and hands the event to the billing service', async () => {
    const res = makeRes()
    await stripeWebhookHandler(signedReq(), res)
    expect(res.statusCode).toBe(200)
    expect(billingService.handleEvent).toHaveBeenCalledWith(expect.objectContaining({ id: 'evt_1', type: 'customer.subscription.updated' }))
  })

  it('rejects a payload signed with another secret', async () => {
    const res = makeRes()
    await stripeWebhookHandler(signedReq(eventPayload, 'whsec_other'), res)
    expect(res.statusCode).toBe(400)
    expect(billingService.handleEvent).not.toHaveBeenCalled()
  })

  it('rejects a payload changed after signing', async () => {
    const req = signedReq()
    ;(req as unknown as { body: Buffer }).body = Buffer.from(eventPayload.replace('sub_1', 'sub_2'))
    const res = makeRes()
    await stripeWebhookHandler(req, res)
    expect(res.statusCode).toBe(400)
  })

  it('rejects a missing signature header or an already-parsed body', async () => {
    const noHeader = makeRes()
    await stripeWebhookHandler({ headers: {}, body: Buffer.from(eventPayload) } as unknown as Request, noHeader)
    expect(noHeader.statusCode).toBe(400)

    const parsed = makeRes()
    await stripeWebhookHandler({ headers: { 'stripe-signature': 't=1,v1=x' }, body: JSON.parse(eventPayload) } as unknown as Request, parsed)
    expect(parsed.statusCode).toBe(400)
    expect(billingService.handleEvent).not.toHaveBeenCalled()
  })

  it('responds 500 when handling fails, so Stripe retries', async () => {
    vi.mocked(billingService.handleEvent).mockRejectedValueOnce(new Error('mongo down'))
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const res = makeRes()
    await stripeWebhookHandler(signedReq(), res)
    expect(res.statusCode).toBe(500)
    error.mockRestore()
  })
})
