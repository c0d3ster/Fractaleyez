import { MongoMemoryServer } from 'mongodb-memory-server'
import mongoose from 'mongoose'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { uploadRepository } from './UploadRepository.js'
import { presetRepository } from './PresetRepository.js'
import { Upload } from '../models/Upload.js'
import { Preset } from '../models/Preset.js'

// Same connectDB() cache seeding as UserRepository.test.ts.
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
  await Upload.deleteMany({})
  await Preset.deleteMany({})
})

const make = (userId: string, name: string, createdAt: string): Promise<unknown> =>
  Upload.create({ userId, key: `particles/${userId}/${name}`, url: `https://cdn.example.com/${name}`, kind: 'sprite', createdAt: new Date(createdAt) })

describe('UploadRepository', () => {
  it("lists only the user's uploads, newest first", async () => {
    await make('user_1', 'old.png', '2026-11-01T00:00:00Z')
    await make('user_2', 'theirs.png', '2026-11-03T00:00:00Z')
    await make('user_1', 'new.png', '2026-11-02T00:00:00Z')
    const rows = await uploadRepository.findByUserId('user_1')
    expect(rows.map((r) => r.url)).toEqual(['https://cdn.example.com/new.png', 'https://cdn.example.com/old.png'])
    expect(rows[0]?.createdAt).toBeInstanceOf(Date)
  })

  it('finds by id, treats a malformed id as missing, and deletes', async () => {
    await make('user_1', 'a.png', '2026-11-01T00:00:00Z')
    const [row] = await uploadRepository.findByUserId('user_1')
    const id = String(row?._id)
    expect((await uploadRepository.findById(id))?.key).toBe('particles/user_1/a.png')
    expect(await uploadRepository.findById('not-an-id')).toBeNull()
    await uploadRepository.deleteById(id)
    expect(await uploadRepository.countByUserId('user_1', 'sprite')).toBe(0)
  })
})

describe('PresetRepository.findConfigsByUserId', () => {
  it("returns the name and config of the user's presets only", async () => {
    await Preset.create({ name: 'mine', sprite: 's', config: { particle: { sprites: ['a'] } }, userId: 'user_1' })
    await Preset.create({ name: 'global', sprite: 's', config: { particle: { sprites: ['a'] } } })
    const rows = await presetRepository.findConfigsByUserId('user_1')
    expect(rows.map((r) => [r.name, r.config])).toEqual([['mine', { particle: { sprites: ['a'] } }]])
  })
})
