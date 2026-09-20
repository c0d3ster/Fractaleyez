import { MongoMemoryServer } from 'mongodb-memory-server'
import mongoose from 'mongoose'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { userRepository } from './UserRepository'
import { User } from '../models/User'

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
