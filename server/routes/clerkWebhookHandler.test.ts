import type { Request, Response } from 'express'
import type { UserJSON } from '@clerk/backend'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Webhook } from 'svix'
import { userService } from '../services/UserService'
import { IUser } from '../models/User'
import { env } from '../env'
import { clerkWebhookHandler } from './clerkWebhookHandler'

vi.mock('svix', () => ({
  Webhook: vi.fn(),
}))
vi.mock('../services/UserService', () => ({
  userService: {
    syncFromClerk: vi.fn(),
  },
}))
vi.mock('../env', () => ({
  env: { CLERK_WEBHOOK_SECRET: 'whsec_test' },
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

const svixHeaders = { 'svix-id': 'msg_1', 'svix-timestamp': '1700000000', 'svix-signature': 'v1,sig' }

const makeReq = (body: Buffer, headers: Record<string, string> = svixHeaders): Request =>
  ({ headers, body }) as unknown as Request

const userJson = { id: 'user_123', external_accounts: [], email_addresses: [] } as unknown as UserJSON

describe('clerkWebhookHandler', () => {
  const verifyMock = vi.fn()
  class MockWebhook {
    verify = verifyMock
  }

  beforeEach(() => {
    verifyMock.mockReset()
    vi.mocked(Webhook).mockReset().mockImplementation(MockWebhook as unknown as new (secret: string) => Webhook)
    vi.mocked(userService.syncFromClerk).mockReset().mockResolvedValue({} as unknown as IUser)
  })

  it('rejects a non-buffer body', async () => {
    const res = makeRes()
    await clerkWebhookHandler(makeReq('not-a-buffer' as unknown as Buffer), res)
    expect(res.statusCode).toBe(400)
  })

  it('rejects a request missing svix headers', async () => {
    const res = makeRes()
    await clerkWebhookHandler(makeReq(Buffer.from('{}'), {}), res)
    expect(res.statusCode).toBe(400)
  })

  it('returns 500 without verifying when the webhook secret is not configured', async () => {
    env.CLERK_WEBHOOK_SECRET = undefined
    const res = makeRes()
    await clerkWebhookHandler(makeReq(Buffer.from('{}')), res)
    expect(res.statusCode).toBe(500)
    expect(verifyMock).not.toHaveBeenCalled()
    env.CLERK_WEBHOOK_SECRET = 'whsec_test'
  })

  it('rejects when signature verification throws', async () => {
    verifyMock.mockImplementation(() => { throw new Error('bad signature') })
    const res = makeRes()
    await clerkWebhookHandler(makeReq(Buffer.from('{}')), res)
    expect(res.statusCode).toBe(400)
    expect(userService.syncFromClerk).not.toHaveBeenCalled()
  })

  it('acks without syncing for event types it does not handle', async () => {
    verifyMock.mockReturnValue({ type: 'session.created', data: {} })
    const res = makeRes()
    await clerkWebhookHandler(makeReq(Buffer.from('{}')), res)
    expect(res.statusCode).toBe(200)
    expect(userService.syncFromClerk).not.toHaveBeenCalled()
  })

  it('rejects a user.created payload missing expected fields', async () => {
    verifyMock.mockReturnValue({ type: 'user.created', data: { foo: 'bar' } })
    const res = makeRes()
    await clerkWebhookHandler(makeReq(Buffer.from('{}')), res)
    expect(res.statusCode).toBe(400)
    expect(userService.syncFromClerk).not.toHaveBeenCalled()
  })

  it('syncs the user on a valid user.created event', async () => {
    verifyMock.mockReturnValue({ type: 'user.created', data: userJson })
    const res = makeRes()
    await clerkWebhookHandler(makeReq(Buffer.from('{}')), res)
    expect(userService.syncFromClerk).toHaveBeenCalledWith(userJson)
    expect(res.statusCode).toBe(200)
  })

  it('syncs the user on a valid user.updated event (redelivery-safe, same call either way)', async () => {
    verifyMock.mockReturnValue({ type: 'user.updated', data: userJson })
    const res = makeRes()
    await clerkWebhookHandler(makeReq(Buffer.from('{}')), res)
    expect(userService.syncFromClerk).toHaveBeenCalledWith(userJson)
    expect(res.statusCode).toBe(200)
  })

  it('returns 500 without leaking internals when the sync fails', async () => {
    verifyMock.mockReturnValue({ type: 'user.created', data: userJson })
    vi.mocked(userService.syncFromClerk).mockRejectedValueOnce(new Error('mongo down'))
    const res = makeRes()
    await clerkWebhookHandler(makeReq(Buffer.from('{}')), res)
    expect(res.statusCode).toBe(500)
  })
})
