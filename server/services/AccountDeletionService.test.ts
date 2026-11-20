import { MongoMemoryServer } from 'mongodb-memory-server'
import mongoose, { Types } from 'mongoose'
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { isStripeConfigured } from '../stripe.js'
import { billingService } from './BillingService.js'
import { storageService } from './StorageService.js'
import { isPublic } from './visibility.js'
import { accountDeletionService } from './AccountDeletionService.js'
import { User } from '../models/User.js'
import { Preset } from '../models/Preset.js'
import { Pack } from '../models/Pack.js'
import { Upload } from '../models/Upload.js'

vi.mock('../stripe.js', () => ({ getStripe: vi.fn(), isStripeConfigured: vi.fn(() => true) }))
vi.mock('./BillingService.js', () => ({ billingService: { cancelSubscriptionsNow: vi.fn() } }))
vi.mock('./StorageService.js', () => ({ storageService: { deleteObject: vi.fn() } }))
vi.mock('./visibility.js', () => ({ isPublic: vi.fn(() => false) }))

// Same as UserRepository.test.ts: seed connectDB()'s cache with the in-memory server's connection.
const globalForMongoose = globalThis as unknown as {
  mongoose: { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null }
}

let mongod: MongoMemoryServer

beforeAll(async () => {
  mongod = await MongoMemoryServer.create()
  const conn = await mongoose.connect(mongod.getUri())
  globalForMongoose.mongoose = { conn, promise: Promise.resolve(conn) }
  await Promise.all([User.syncIndexes(), Preset.syncIndexes(), Pack.syncIndexes(), Upload.syncIndexes()])
}, 60_000)

afterAll(async () => {
  await mongoose.disconnect()
  await mongod.stop()
})

const USER = 'user_gone'
const OTHER = 'user_other'
const CDN = 'https://cdn.example.com/particles'

const config = (sprites: string[]): Record<string, unknown> => ({ particle: { sprites } })

const makePreset = (name: string, userId: string | undefined, sprites: string[] = ['fractaleye.png']): Promise<unknown> =>
  Preset.create({ name, sprite: sprites[0] ?? 'fractaleye.png', config: config(sprites), ...(userId ? { userId } : {}) })

const makePack = (slug: string, userId: string, origin: 'builtIn' | 'creator' | undefined, presetIds: Types.ObjectId[] = []): Promise<unknown> =>
  Pack.create({ name: slug, slug, userId, ...(origin ? { origin } : {}), presetIds })

const makeUpload = (userId: string, name: string, kind: 'sprite' | 'avatar' = 'sprite'): Promise<unknown> =>
  Upload.create({ userId, key: `particles/${userId}/${name}`, url: `${CDN}/${userId}/${name}`, kind })

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Preset.deleteMany({}), Pack.deleteMany({}), Upload.deleteMany({})])
  vi.mocked(isStripeConfigured).mockReset().mockReturnValue(true)
  vi.mocked(billingService.cancelSubscriptionsNow).mockReset().mockResolvedValue(['sub_1'])
  vi.mocked(storageService.deleteObject).mockReset().mockResolvedValue(undefined)
  vi.mocked(isPublic).mockReset().mockReturnValue(false)
})

describe('AccountDeletionService.deleteAccount', () => {
  it('cancels the Stripe subscriptions of a user with a customer, before anything is deleted', async () => {
    await User.create({ clerkId: USER, billing: { customerId: 'cus_1' } })
    vi.mocked(billingService.cancelSubscriptionsNow).mockImplementation(async () => {
      expect(await User.countDocuments({ clerkId: USER })).toBe(1)
      return ['sub_1']
    })

    const result = await accountDeletionService.deleteAccount(USER)

    expect(billingService.cancelSubscriptionsNow).toHaveBeenCalledWith('cus_1')
    expect(result.canceledSubscriptions).toEqual(['sub_1'])
    expect(result.stripeOk).toBe(true)
  })

  it('skips Stripe without a customer, or when Stripe is not configured', async () => {
    await User.create({ clerkId: USER })
    await accountDeletionService.deleteAccount(USER)
    expect(billingService.cancelSubscriptionsNow).not.toHaveBeenCalled()

    await User.create({ clerkId: USER, billing: { customerId: 'cus_1' } })
    vi.mocked(isStripeConfigured).mockReturnValue(false)
    await accountDeletionService.deleteAccount(USER)
    expect(billingService.cancelSubscriptionsNow).not.toHaveBeenCalled()
  })

  it('deletes all the data when Stripe fails', async () => {
    await User.create({ clerkId: USER, billing: { customerId: 'cus_1' } })
    await makePreset('mine', USER)
    await makePack('my-pack', USER, 'creator')
    await makeUpload(USER, 'a.png')
    vi.mocked(billingService.cancelSubscriptionsNow).mockRejectedValue(new Error('Stripe is down'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const result = await accountDeletionService.deleteAccount(USER)

    expect(result.stripeOk).toBe(false)
    expect(consoleError).toHaveBeenCalled()
    expect(await User.countDocuments({ clerkId: USER })).toBe(0)
    expect(await Preset.countDocuments({ userId: USER })).toBe(0)
    expect(await Pack.countDocuments({ userId: USER })).toBe(0)
    expect(await Upload.countDocuments({ userId: USER })).toBe(0)
    consoleError.mockRestore()
  })

  it("deletes the user's private presets and packs and leaves other users' alone", async () => {
    await User.create({ clerkId: USER })
    await makePreset('mine', USER)
    await makePreset('shared name', USER)
    await makePreset('shared name', OTHER)
    await makePack('my-pack', USER, 'creator')
    await makePack('their-pack', OTHER, 'creator')

    const result = await accountDeletionService.deleteAccount(USER)

    expect(result).toMatchObject({ deletedPresets: 2, keptPresets: 0, deletedPacks: 1, keptPacks: 0 })
    expect(await Preset.countDocuments({ userId: USER })).toBe(0)
    expect(await Preset.countDocuments({ userId: OTHER })).toBe(1)
    expect(await Pack.exists({ slug: 'my-pack' })).toBeNull()
    expect(await Pack.exists({ slug: 'their-pack' })).not.toBeNull()
  })

  it('drops deleted presets from the packs that listed them', async () => {
    await User.create({ clerkId: USER })
    const mine = await Preset.create({ name: 'mine', sprite: 'x.png', config: {}, userId: USER })
    const theirs = await Preset.create({ name: 'theirs', sprite: 'x.png', config: {}, userId: OTHER })
    await makePack('their-pack', OTHER, 'creator', [mine._id, theirs._id])

    await accountDeletionService.deleteAccount(USER)

    const pack = await Pack.findOne({ slug: 'their-pack' }).lean()
    expect(pack?.presetIds.map(String)).toEqual([String(theirs._id)])
  })

  it('keeps public presets and packs, unlinked, once isPublic says so', async () => {
    await User.create({ clerkId: USER })
    await makePreset('public one', USER)
    await makePreset('private one', USER)
    await makePack('public-pack', USER, 'creator')
    await makePack('private-pack', USER, 'creator')
    vi.mocked(isPublic).mockImplementation((content) => {
      const named = content as { name?: string; slug?: string }
      return named.name === 'public one' || named.slug === 'public-pack'
    })

    const result = await accountDeletionService.deleteAccount(USER)

    expect(result).toMatchObject({ deletedPresets: 1, keptPresets: 1, deletedPacks: 1, keptPacks: 1 })
    const kept = await Preset.findOne({ name: 'public one' }).lean()
    expect(kept).not.toBeNull()
    expect(kept?.userId).toBeUndefined()
    expect(await Preset.exists({ name: 'private one' })).toBeNull()
    const keptPack = await Pack.findOne({ slug: 'public-pack' }).lean()
    expect(keptPack?.userId).toBeUndefined()
    expect(await Pack.exists({ slug: 'private-pack' })).toBeNull()
  })

  it('renames a kept preset whose name clashes with a global preset once unlinked', async () => {
    await User.create({ clerkId: USER })
    await makePreset('shlump', undefined)
    await makePreset('shlump', USER)
    vi.mocked(isPublic).mockReturnValue(true)

    await accountDeletionService.deleteAccount(USER)

    const names = (await Preset.find({}).lean()).map((p) => p.name).sort()
    expect(names).toHaveLength(2)
    expect(names[0]).toBe('shlump')
    expect(names[1]).toMatch(/^shlump \([0-9a-f]{6}\)$/)
    expect(await Preset.countDocuments({ userId: USER })).toBe(0)
  })

  it("keeps built-in packs, global presets and the presets they list when the admin's account is deleted", async () => {
    await User.create({ clerkId: USER, isAdmin: true })
    const global = await Preset.create({ name: 'shlump', sprite: 'shlump.png', config: {} })
    const adminPreset = await Preset.create({ name: 'admin made', sprite: 'x.png', config: {}, userId: USER })
    await makePack('essentials', USER, undefined, [global._id, adminPreset._id])
    await makePack('galaxy', USER, 'builtIn', [global._id])
    await makePack('admin-private', USER, 'creator')

    const result = await accountDeletionService.deleteAccount(USER)

    expect(result).toMatchObject({ keptPacks: 2, deletedPacks: 1, keptPresets: 1, deletedPresets: 0 })
    for (const slug of ['essentials', 'galaxy']) {
      const pack = await Pack.findOne({ slug }).lean()
      expect(pack).not.toBeNull()
      expect(pack?.userId).toBeUndefined()
    }
    const essentials = await Pack.findOne({ slug: 'essentials' }).lean()
    expect(essentials?.presetIds.map(String)).toEqual([String(global._id), String(adminPreset._id)])
    expect(await Preset.exists({ _id: global._id })).not.toBeNull()
    const kept = await Preset.findById(adminPreset._id).lean()
    expect(kept?.userId).toBeUndefined()
    expect(await Pack.exists({ slug: 'admin-private' })).toBeNull()
  })

  it('deletes the upload records and their R2 objects', async () => {
    await User.create({ clerkId: USER })
    await makeUpload(USER, 'a.png')
    await makeUpload(USER, 'avatar.png', 'avatar')
    await makeUpload(OTHER, 'b.png')

    const result = await accountDeletionService.deleteAccount(USER)

    expect(result).toMatchObject({ deletedUploads: 2, keptUploads: 0 })
    expect(vi.mocked(storageService.deleteObject).mock.calls.map(([key]) => key).sort())
      .toEqual([`particles/${USER}/a.png`, `particles/${USER}/avatar.png`])
    expect(await Upload.countDocuments({ userId: USER })).toBe(0)
    expect(await Upload.countDocuments({ userId: OTHER })).toBe(1)
  })

  it('keeps an upload that kept content still shows, and deletes the one only private content used', async () => {
    await User.create({ clerkId: USER, isAdmin: true })
    const builtInSprite = `${CDN}/${USER}/built-in.png`
    const keptSprite = `${CDN}/${USER}/kept.png`
    const privateSprite = `${CDN}/${USER}/private.png`
    await makeUpload(USER, 'built-in.png')
    await makeUpload(USER, 'kept.png')
    await makeUpload(USER, 'private.png')
    await makePreset('global', undefined, ['fractaleye.png', builtInSprite])
    await Preset.create({ name: 'public one', sprite: keptSprite, config: { logo: { sprite: { value: [keptSprite] } } }, userId: USER })
    await makePreset('private one', USER, [privateSprite])
    vi.mocked(isPublic).mockImplementation((content) => (content as { name?: string }).name === 'public one')

    const result = await accountDeletionService.deleteAccount(USER)

    expect(result).toMatchObject({ deletedUploads: 1, keptUploads: 2 })
    expect(storageService.deleteObject).toHaveBeenCalledTimes(1)
    expect(storageService.deleteObject).toHaveBeenCalledWith(`particles/${USER}/private.png`)
    const kept = await Upload.find({ url: { $in: [builtInSprite, keptSprite] } }).lean()
    expect(kept).toHaveLength(2)
    for (const upload of kept) expect(upload.userId).toBeUndefined()
    expect(await Upload.exists({ url: privateSprite })).toBeNull()
  })

  it('keeps the upload record when its R2 delete fails, so a redelivery retries it', async () => {
    await User.create({ clerkId: USER })
    await makeUpload(USER, 'a.png')
    vi.mocked(storageService.deleteObject).mockRejectedValueOnce(new Error('R2 down'))

    await expect(accountDeletionService.deleteAccount(USER)).rejects.toThrow('R2 down')
    expect(await Upload.countDocuments({ userId: USER })).toBe(1)
    expect(await User.countDocuments({ clerkId: USER })).toBe(1)

    await accountDeletionService.deleteAccount(USER)
    expect(await Upload.countDocuments({ userId: USER })).toBe(0)
    expect(await User.countDocuments({ clerkId: USER })).toBe(0)
  })

  it("deletes the user's own User document only", async () => {
    await User.create({ clerkId: USER })
    await User.create({ clerkId: OTHER })
    const result = await accountDeletionService.deleteAccount(USER)
    expect(result.hadUser).toBe(true)
    expect(await User.countDocuments({ clerkId: USER })).toBe(0)
    expect(await User.countDocuments({ clerkId: OTHER })).toBe(1)
  })

  it('does nothing on a second delivery', async () => {
    await User.create({ clerkId: USER, billing: { customerId: 'cus_1' } })
    await makePreset('mine', USER)
    await makeUpload(USER, 'a.png')
    await makePack('essentials', USER, 'builtIn')
    await accountDeletionService.deleteAccount(USER)
    vi.mocked(billingService.cancelSubscriptionsNow).mockClear()
    vi.mocked(storageService.deleteObject).mockClear()
    const before = await Promise.all([Preset.find({}).lean(), Pack.find({}).lean(), Upload.find({}).lean()])

    const result = await accountDeletionService.deleteAccount(USER)

    expect(result).toEqual({
      hadUser: false, canceledSubscriptions: [], stripeOk: true,
      deletedPresets: 0, keptPresets: 0, deletedPacks: 0, keptPacks: 0, deletedUploads: 0, keptUploads: 0,
    })
    expect(billingService.cancelSubscriptionsNow).not.toHaveBeenCalled()
    expect(storageService.deleteObject).not.toHaveBeenCalled()
    expect(await Promise.all([Preset.find({}).lean(), Pack.find({}).lean(), Upload.find({}).lean()])).toEqual(before)
  })

  it('does nothing for a user who never had a document', async () => {
    await makePreset('global', undefined)
    const result = await accountDeletionService.deleteAccount('user_never')
    expect(result.hadUser).toBe(false)
    expect(billingService.cancelSubscriptionsNow).not.toHaveBeenCalled()
    expect(await Preset.countDocuments({})).toBe(1)
  })
})
