import type { Request, Response } from 'express'
import { Webhook } from 'svix'
import type { UserJSON } from '@clerk/backend'
import { env } from '../env.js'
import { userService } from '../services/UserService.js'
import { accountDeletionService } from '../services/AccountDeletionService.js'

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

// Clerk's user.deleted payload is a deleted-object stub: { object: 'user', id, deleted: true }.
const deletedUserId = (data: unknown): string | null => {
  if (typeof data !== 'object' || data === null) return null
  const { id } = data as Record<string, unknown>
  return typeof id === 'string' && id.length > 0 ? id : null
}

/** Safe to redeliver: a second delivery, or a user who never had a document, finds nothing to delete and still answers 200. */
const handleUserDeleted = async (data: unknown, res: Response): Promise<void> => {
  const clerkId = deletedUserId(data)
  if (!clerkId) {
    console.error('Clerk user.deleted payload has no user id')
    res.status(400).json({ error: 'Invalid payload' })
    return
  }
  try {
    const result = await accountDeletionService.deleteAccount(clerkId)
    console.info(`Deleted the data of Clerk user ${clerkId}`, result)
    res.status(200).json({ received: true })
  } catch (err) {
    // 500 so Clerk redelivers; every step that already ran is a no-op the next time.
    console.error(`Failed to delete the data of Clerk user ${clerkId}`, err)
    res.status(500).json({ error: 'Internal server error' })
  }
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

  if (!env.CLERK_WEBHOOK_SECRET) {
    console.error('CLERK_WEBHOOK_SECRET is not configured')
    res.status(500).json({ error: 'Internal server error' })
    return
  }

  let event: unknown
  try {
    const webhook = new Webhook(env.CLERK_WEBHOOK_SECRET)
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

  if (isClerkEventEnvelope(event) && event.type === 'user.deleted') {
    await handleUserDeleted(event.data, res)
    return
  }

  // Redelivery of an event this handler doesn't act on (e.g. session.*) is a no-op ack.
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
