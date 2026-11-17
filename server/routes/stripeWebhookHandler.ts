import type { Request, Response } from 'express'
import type Stripe from 'stripe'
import { env } from '../env.js'
import { getStripe } from '../stripe.js'
import { billingService } from '../services/BillingService.js'

// Subscription and checkout events are a few KB; this only caps an unauthenticated flood before verification.
export const MAX_STRIPE_WEBHOOK_BYTES = 1 * 1024 * 1024

/**
 * POST /api/stripeWebhook. Verifies the signature on the raw body, then lets BillingService sync the subscription. A
 * failure responds 500 so Stripe retries (with backoff, for up to three days); every event is safe to apply twice.
 */
export const stripeWebhookHandler = async (req: Request, res: Response): Promise<void> => {
  const payload = req.body
  if (!Buffer.isBuffer(payload)) {
    res.status(400).json({ error: 'Expected raw request body' })
    return
  }

  const signature = req.headers['stripe-signature']
  if (typeof signature !== 'string') {
    res.status(400).json({ error: 'Missing stripe-signature header' })
    return
  }

  if (!env.STRIPE_WEBHOOK_SECRET) {
    console.error('STRIPE_WEBHOOK_SECRET is not configured')
    res.status(500).json({ error: 'Internal server error' })
    return
  }

  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(payload, signature, env.STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    // The message only: Stripe's signature error also carries the payload (customer details) and the header.
    console.error('Stripe webhook signature verification failed:', err instanceof Error ? err.message : 'unknown error')
    res.status(400).json({ error: 'Invalid signature' })
    return
  }

  try {
    await billingService.handleEvent(event)
    res.status(200).json({ received: true })
  } catch (err) {
    console.error(`Failed to handle Stripe event ${event.id} (${event.type}):`, err instanceof Error ? err.message : err)
    res.status(500).json({ error: 'Internal server error' })
  }
}
