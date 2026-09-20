import type { Request, Response } from 'express'
import { Webhook } from 'svix'
import type { UserJSON } from '@clerk/backend'
import { requireEnv } from '../env'
import { userService } from '../services/UserService'

// Clerk's user.* payloads are a few KB at most; this is just a ceiling against an
// unauthenticated caller flooding memory before signature verification can reject them.
export const MAX_WEBHOOK_BYTES = 1 * 1024 * 1024

type ClerkEventEnvelope = { type: string; data: unknown }

const isClerkEventEnvelope = (value: unknown): value is ClerkEventEnvelope =>
  typeof value === 'object' && value !== null && 'type' in value && 'data' in value

const isUserPayload = (data: unknown): data is UserJSON => {
  if (typeof data !== 'object' || data === null) return false
  const candidate = data as Record<string, unknown>
  return typeof candidate.id === 'string' &&
    Array.isArray(candidate.external_accounts) &&
    Array.isArray(candidate.email_addresses)
}

export const clerkWebhookHandler = async (req: Request, res: Response): Promise<void> => {
  const payload = req.body
  if (!Buffer.isBuffer(payload)) {
    res.status(400).json({ error: 'Expected raw request body' })
    return
  }

  const svixId = req.headers['svix-id']
  const svixTimestamp = req.headers['svix-timestamp']
  const svixSignature = req.headers['svix-signature']
  if (typeof svixId !== 'string' || typeof svixTimestamp !== 'string' || typeof svixSignature !== 'string') {
    res.status(400).json({ error: 'Missing svix headers' })
    return
  }

  let event: unknown
  try {
    const webhook = new Webhook(requireEnv.CLERK_WEBHOOK_SECRET())
    event = webhook.verify(payload, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    })
  } catch (err) {
    console.error('Clerk webhook signature verification failed', err)
    res.status(400).json({ error: 'Invalid signature' })
    return
  }

  // Redelivery of an event this handler doesn't act on (e.g. user.deleted, session.*) is a no-op ack.
  if (!isClerkEventEnvelope(event) || (event.type !== 'user.created' && event.type !== 'user.updated')) {
    res.status(200).json({ received: true })
    return
  }

  if (!isUserPayload(event.data)) {
    console.error('Clerk webhook user payload missing expected fields')
    res.status(400).json({ error: 'Invalid payload' })
    return
  }

  try {
    await userService.syncFromClerk(event.data)
    res.status(200).json({ received: true })
  } catch (err) {
    console.error('Failed to sync user from Clerk webhook', err)
    res.status(500).json({ error: 'Internal server error' })
  }
}
