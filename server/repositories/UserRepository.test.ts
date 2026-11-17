import { MongoMemoryServer } from 'mongodb-memory-server'
import mongoose from 'mongoose'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { userRepository } from './UserRepository.js'
import { User } from '../models/User.js'

// db.ts's connectDB() reads MONGO_URI from a snapshot of process.env taken at module import
// time (env.ts), which is too early for a value only known once MongoMemoryServer starts.
// Seeding its cache directly (same shape it populates itself) makes connectDB() short-circuit
// on the already-open connection instead of touching the env var at all.
const globalForMongoose = globalThis as unknown as {
  mongoose: { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null }
}

let mongod: MongoMemoryServer

beforeAll(async () => {
  mongod = await MongoMemoryServer.create()
  const conn = await mongoose.connect(mongod.getUri())
  globalForMongoose.mongoose = { conn, promise: Promise.resolve(conn) }
}, 60_000)

afterAll(async () => {
  await mongoose.disconnect()
  await mongod.stop()
})

beforeEach(async () => {
  await User.deleteMany({})
})

describe('UserRepository.upsertByClerkId', () => {
  it('creates a new user document when none exists', async () => {
    const user = await userRepository.upsertByClerkId('user_1', {})
    expect(user.clerkId).toBe('user_1')
    expect(user.displayName).toBe('')
    expect(await User.countDocuments({ clerkId: 'user_1' })).toBe(1)
  })

  it('fetches the existing document without overwriting fields on a plain lazy-create call', async () => {
    await userRepository.upsertByClerkId('user_2', { displayName: 'Ada Lovelace' })
    const fetched = await userRepository.upsertByClerkId('user_2', {})
    expect(fetched.displayName).toBe('Ada Lovelace')
    expect(await User.countDocuments({ clerkId: 'user_2' })).toBe(1)
  })

  it('updates only the provided fields, keyed on clerkId', async () => {
    await userRepository.upsertByClerkId('user_3', { displayName: 'Old Name' })
    const updated = await userRepository.upsertByClerkId('user_3', { displayName: 'New Name' })
    expect(updated.displayName).toBe('New Name')
    expect(await User.countDocuments({ clerkId: 'user_3' })).toBe(1)
  })

  it('is a no-op re-application when a webhook event is redelivered with the same data', async () => {
    await userRepository.upsertByClerkId('user_4', { displayName: 'Same Name' })
    await userRepository.upsertByClerkId('user_4', { displayName: 'Same Name' })
    expect(await User.countDocuments({ clerkId: 'user_4' })).toBe(1)
  })

  it('creates no duplicates when concurrent first-requests race on the same clerkId', async () => {
    await Promise.all(Array.from({ length: 10 }, () => userRepository.upsertByClerkId('user_race', {})))
    expect(await User.countDocuments({ clerkId: 'user_race' })).toBe(1)
  })
})

describe('UserRepository.updateSettings', () => {
  it('creates the user doc and applies the patch when none exists yet', async () => {
    const user = await userRepository.updateSettings('user_settings_1', { crossfadeDurationMs: 500 })
    expect(user.settings.crossfadeDurationMs).toBe(500)
    expect(await User.countDocuments({ clerkId: 'user_settings_1' })).toBe(1)
  })

  it('merges a partial patch without clobbering sibling settings fields', async () => {
    await userRepository.upsertByClerkId('user_settings_2', {})
    await userRepository.updateSettings('user_settings_2', { crossfadeDurationMs: 1200 })
    const updated = await userRepository.updateSettings('user_settings_2', { logoParticle: 'https://cdn.example.com/logo.png' })
    expect(updated.settings.crossfadeDurationMs).toBe(1200)
    expect(updated.settings.logoParticle).toBe('https://cdn.example.com/logo.png')
  })

  it('merges hud settings alongside other fields', async () => {
    await userRepository.upsertByClerkId('user_settings_3', {})
    await userRepository.updateSettings('user_settings_3', { crossfadeDurationMs: 900 })
    const updated = await userRepository.updateSettings('user_settings_3', { hud: { enabledFreqBands: [true, false, true] } })
    expect(updated.settings.crossfadeDurationMs).toBe(900)
    expect(updated.settings.hud).toEqual({ enabledFreqBands: [true, false, true] })
  })

  it('is idempotent when the same patch is applied twice', async () => {
    await userRepository.updateSettings('user_settings_4', { crossfadeDurationMs: 750 })
    await userRepository.updateSettings('user_settings_4', { crossfadeDurationMs: 750 })
    expect(await User.countDocuments({ clerkId: 'user_settings_4' })).toBe(1)
  })
})

describe('UserRepository billing', () => {
  it('links a Stripe customer once, and the first link wins', async () => {
    await userRepository.upsertByClerkId('user_b1', {})
    expect(await userRepository.linkStripeCustomer('user_b1', 'cus_first')).toBe('cus_first')
    expect(await userRepository.linkStripeCustomer('user_b1', 'cus_second')).toBe('cus_first')
    expect((await userRepository.findByStripeCustomerId('cus_first'))?.clerkId).toBe('user_b1')
    expect(await userRepository.findByStripeCustomerId('cus_second')).toBeNull()
  })

  it('refuses to link a customer to a user that does not exist', async () => {
    await expect(userRepository.linkStripeCustomer('user_missing', 'cus_x')).rejects.toThrow()
  })

  it('writes the plan and subscription mirror without touching the customer id or settings', async () => {
    await userRepository.upsertByClerkId('user_b2', {})
    await userRepository.updateSettings('user_b2', { quality: 'ultra' })
    await userRepository.linkStripeCustomer('user_b2', 'cus_b2')
    const periodEnd = new Date('2027-01-01T00:00:00Z')

    const synced = await userRepository.syncBilling('cus_b2', {
      plan: 'tier1',
      billing: { subscriptionId: 'sub_b2', status: 'active', cancelAtPeriodEnd: false, currentPeriodEnd: periodEnd },
    })
    expect(synced?.plan).toBe('tier1')
    expect(synced?.billing.customerId).toBe('cus_b2')
    expect(synced?.billing.currentPeriodEnd?.toISOString()).toBe(periodEnd.toISOString())
    expect(synced?.settings.quality).toBe('ultra')

    const lapsed = await userRepository.syncBilling('cus_b2', {
      plan: 'free',
      billing: { subscriptionId: 'sub_b2', status: 'canceled', cancelAtPeriodEnd: false, currentPeriodEnd: undefined },
    })
    expect(lapsed?.plan).toBe('free')
    expect(lapsed?.billing.status).toBe('canceled')
    expect(lapsed?.billing.currentPeriodEnd).toBeUndefined()
  })

  it('swaps a deleted customer for a new one and resets the plan, only while still linked to the deleted one', async () => {
    await userRepository.upsertByClerkId('user_b4', {})
    await userRepository.linkStripeCustomer('user_b4', 'cus_gone')
    await userRepository.syncBilling('cus_gone', { plan: 'tier1', billing: { subscriptionId: 'sub_x', status: 'active', cancelAtPeriodEnd: false, currentPeriodEnd: new Date() } })

    expect(await userRepository.replaceStripeCustomer('user_b4', 'cus_gone', 'cus_fresh')).toBe('cus_fresh')
    const swapped = await userRepository.findByStripeCustomerId('cus_fresh')
    expect(swapped?.plan).toBe('free')
    expect(swapped?.billing.subscriptionId).toBeUndefined()

    expect(await userRepository.replaceStripeCustomer('user_b4', 'cus_gone', 'cus_other')).toBe('cus_fresh')
  })

  it('defaults new users to the free plan', async () => {
    const user = await userRepository.upsertByClerkId('user_b3', {})
    expect(user.plan).toBe('free')
  })
})
