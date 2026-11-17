import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Types } from 'mongoose'
import { packRepository, PackMeta } from '../repositories/PackRepository.js'
import { userRepository } from '../repositories/UserRepository.js'
import { IUser, PlanId } from '../models/User.js'
import { IPack, PackOrigin } from '../models/Pack.js'
import { PackService } from './PackService.js'

// The real EntitlementService runs against these mocks.
vi.mock('../repositories/PackRepository.js', () => ({
  packRepository: { findAll: vi.fn(), findByUserId: vi.fn(), countByUserId: vi.fn(), create: vi.fn() },
}))
vi.mock('../repositories/PresetRepository.js', () => ({
  presetRepository: { countByUserId: vi.fn() },
}))
vi.mock('../repositories/UploadRepository.js', () => ({
  uploadRepository: { countByUserId: vi.fn() },
}))
vi.mock('../repositories/UserRepository.js', () => ({
  userRepository: { findByClerkId: vi.fn() },
}))

const pack = (name: string, userId: string, isPremium: boolean, origin?: PackOrigin): PackMeta => ({
  _id: new Types.ObjectId(),
  name,
  slug: name.toLowerCase(),
  userId,
  isPremium,
  ...(origin ? { origin } : {}),
})

const asUser = (plan: PlanId, isAdmin = false): void => {
  vi.mocked(userRepository.findByClerkId).mockResolvedValue({ plan, isAdmin } as unknown as IUser)
}

describe('PackService.listPacks entitlement', () => {
  const service = new PackService()

  beforeEach(() => {
    vi.mocked(packRepository.findAll).mockResolvedValue([pack('Galaxy', 'creator', true), pack('Sacred', 'creator', true)])
    vi.mocked(userRepository.findByClerkId).mockReset()
    asUser('free')
  })

  it('entitles an admin to every pack without making them the owner', async () => {
    asUser('free', true)
    const packs = await service.listPacks('admin-id')
    expect(packs.map((p) => p.isEntitled)).toEqual([true, true])
    expect(packs.map((p) => p.isOwn)).toEqual([false, false])
    expect(packs.map((p) => p.isPremium)).toEqual([true, true])
  })

  it('entitles the creator', async () => {
    expect((await service.listPacks('creator')).map((p) => p.isEntitled)).toEqual([true, true])
  })

  it('does not entitle a Dream viewer to a premium pack', async () => {
    expect((await service.listPacks('someone')).map((p) => p.isEntitled)).toEqual([false, false])
  })

  it('does not entitle a signed-out viewer or look anyone up for them', async () => {
    expect((await service.listPacks(null)).map((p) => p.isEntitled)).toEqual([false, false])
    expect(userRepository.findByClerkId).not.toHaveBeenCalled()
  })

  it('entitles everyone, signed out too, to a free pack', async () => {
    vi.mocked(packRepository.findAll).mockResolvedValue([pack('Free', 'owner', false)])
    expect((await service.listPacks(null))[0]?.isEntitled).toBe(true)
    expect((await service.listPacks('someone'))[0]?.isEntitled).toBe(true)
  })

  it('includes built-in premium packs (and older packs without an origin) for Lucid, but not creator packs', async () => {
    vi.mocked(packRepository.findAll).mockResolvedValue([
      pack('Legacy', 'owner', true),
      pack('BuiltIn', 'owner', true, 'builtIn'),
      pack('Creator', 'creator', true, 'creator'),
    ])
    asUser('tier1')
    expect((await service.listPacks('someone')).map((p) => p.isEntitled)).toEqual([true, true, false])
  })

  it('includes every pack for Third Eye', async () => {
    vi.mocked(packRepository.findAll).mockResolvedValue([pack('BuiltIn', 'owner', true, 'builtIn'), pack('Creator', 'creator', true, 'creator')])
    asUser('tier2')
    expect((await service.listPacks('someone')).map((p) => p.isEntitled)).toEqual([true, true])
  })
})

describe('PackService.createPack', () => {
  const service = new PackService()
  const created = { _id: 'k1', name: 'Mine', slug: 'mine' } as unknown as IPack

  beforeEach(() => {
    vi.mocked(packRepository.create).mockReset().mockResolvedValue(created)
    vi.mocked(packRepository.countByUserId).mockReset().mockResolvedValue(0)
    asUser('free')
  })

  it('creates a Dream user\'s first pack as a creator pack', async () => {
    await expect(service.createPack({ name: 'Mine', userId: 'u1' })).resolves.toBe(created)
    expect(packRepository.create).toHaveBeenCalledWith(expect.objectContaining({ slug: 'mine', userId: 'u1', origin: 'creator' }))
  })

  it('refuses a pack over the plan limit with the quota details', async () => {
    vi.mocked(packRepository.countByUserId).mockResolvedValue(1)
    await expect(service.createPack({ name: 'Second', userId: 'u1' })).rejects.toMatchObject({ status: 403, quota: 'privatePacks', limit: 1 })
    asUser('tier1')
    await expect(service.createPack({ name: 'Second', userId: 'u1' })).resolves.toBe(created)
    expect(packRepository.create).toHaveBeenCalledTimes(1)
  })

  it('refuses premium or priced packs from a non-admin, whatever the plan', async () => {
    asUser('tier2')
    await expect(service.createPack({ name: 'Paid', userId: 'u1', isPremium: true })).rejects.toMatchObject({ status: 403 })
    await expect(service.createPack({ name: 'Paid', userId: 'u1', price: 3 })).rejects.toMatchObject({ status: 403 })
    expect(packRepository.create).not.toHaveBeenCalled()
  })

  it('lets an admin make premium built-in packs with no limit', async () => {
    asUser('free', true)
    vi.mocked(packRepository.countByUserId).mockResolvedValue(40)
    await expect(service.createPack({ name: 'Galaxy', userId: 'admin', isPremium: true })).resolves.toBe(created)
    expect(packRepository.create).toHaveBeenCalledWith(expect.objectContaining({ isPremium: true, origin: 'builtIn' }))
  })
})
