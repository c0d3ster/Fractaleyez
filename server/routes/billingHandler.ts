import type { Request, Response } from 'express'
import { AuthUnauthorizedError, verifyAuth } from '../auth.js'
import { env } from '../env.js'
import { isPaidPlanId } from '../models/User.js'
import { BillingError, billingService, isBillingInterval } from '../services/BillingService.js'

const BILLING_ERROR_STATUS: Record<BillingError['code'], number> = {
  already_subscribed: 409,
  no_customer: 409,
  price_not_found: 404,
  unavailable: 503,
}

const parseHttpUrl = (value: string | undefined): URL | null => {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

/**
 * Where Stripe sends the user back to: APP_URL when set, else the page's own origin. Only ever the root path, so the
 * client cannot pick a redirect target (it could only redirect itself anyway, but there is no reason to allow it).
 */
const resolveReturnUrl = (req: Request): string | null => {
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : undefined
  const base = parseHttpUrl(env.APP_URL) ?? parseHttpUrl(origin)
  return base ? new URL('/', base).toString() : null
}

const authenticate = async (req: Request, res: Response): Promise<string | null> => {
  try {
    return await verifyAuth(req.headers.authorization)
  } catch (err) {
    if (err instanceof AuthUnauthorizedError) {
      res.status(401).json({ error: 'Unauthorized' })
      return null
    }
    console.error('billing auth failed:', err)
    res.status(500).json({ error: 'Internal server error' })
    return null
  }
}

const sendBillingFailure = (res: Response, err: unknown): void => {
  if (err instanceof BillingError) {
    res.status(BILLING_ERROR_STATUS[err.code]).json({ error: err.message, code: err.code })
    return
  }
  console.error('Billing request failed', err)
  res.status(500).json({ error: 'Internal server error' })
}

/** GET /api/billing: the viewer's plan and subscription state. */
export const billingStatusHandler = async (req: Request, res: Response): Promise<void> => {
  const clerkId = await authenticate(req, res)
  if (!clerkId) return
  try {
    res.status(200).json(await billingService.getStatus(clerkId))
  } catch (err) {
    sendBillingFailure(res, err)
  }
}

/**
 * POST /api/billing with `{ action: 'checkout', plan, interval? }` (a Stripe Checkout URL for a new subscription) or
 * `{ action: 'portal' }` (a Customer Portal URL to switch plans, cancel, or update the card). Responds `{ url }`.
 */
export const billingActionHandler = async (req: Request, res: Response): Promise<void> => {
  const clerkId = await authenticate(req, res)
  if (!clerkId) return

  const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {}
  const returnUrl = resolveReturnUrl(req)
  if (!returnUrl) {
    res.status(400).json({ error: 'Cannot resolve a return URL: set APP_URL or send an Origin header' })
    return
  }

  try {
    if (body.action === 'checkout') {
      const { plan } = body
      const interval = body.interval ?? 'monthly'
      if (!isPaidPlanId(plan)) {
        res.status(400).json({ error: 'plan must be tier1 or tier2' })
        return
      }
      if (!isBillingInterval(interval)) {
        res.status(400).json({ error: 'interval must be monthly or yearly' })
        return
      }
      const url = await billingService.createCheckoutSession({ clerkId, plan, interval, returnUrl })
      res.status(200).json({ url })
      return
    }

    if (body.action === 'portal') {
      const url = await billingService.createPortalSession(clerkId, returnUrl)
      res.status(200).json({ url })
      return
    }

    res.status(400).json({ error: 'action must be checkout or portal' })
  } catch (err) {
    sendBillingFailure(res, err)
  }
}
