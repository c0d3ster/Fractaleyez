import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Types } from 'mongoose'
import { packRepository, PackMeta } from '../repositories/PackRepository'
import { PackService } from './PackService'
import { userService } from './UserService'

vi.mock('../repositories/PackRepository', () => ({
  packRepository: { findAll: vi.fn(), findByUserId: vi.fn() },
}))
vi.mock('./UserService', () => ({
  userService: { isAdmin: vi.fn() },
}))

const pack = (name: string, userId: string, isPremium: boolean): PackMeta => ({
  _id: new Types.ObjectId(),
  name,
  slug: name.toLowerCase(),
  userId,
  isPremium,
})

describe('PackService.listPacks entitlement', () => {
  const service = new PackService()

  beforeEach(() => {
    vi.mocked(packRepository.findAll).mockResolvedValue([pack('Galaxy', 'creator', true), pack('Sacred', 'creator', true)])
    vi.mocked(userService.isAdmin).mockReset()
  })

  it('entitles an admin to every pack without making them the owner', async () => {
    vi.mocked(userService.isAdmin).mockResolvedValue(true)
    const packs = await service.listPacks('admin-id')
    expect(packs.map((p) => p.isEntitled)).toEqual([true, true])
    expect(packs.map((p) => p.isOwn)).toEqual([false, false])
    expect(packs.map((p) => p.isPremium)).toEqual([true, true])
  })

  it('entitles the creator', async () => {
    vi.mocked(userService.isAdmin).mockResolvedValue(false)
    expect((await service.listPacks('creator')).map((p) => p.isEntitled)).toEqual([true, true])
  })

  it('does not entitle another signed-in viewer', async () => {
    vi.mocked(userService.isAdmin).mockResolvedValue(false)
    expect((await service.listPacks('someone')).map((p) => p.isEntitled)).toEqual([false, false])
  })

  it('does not entitle a signed-out viewer or look up admin for them', async () => {
    expect((await service.listPacks(null)).map((p) => p.isEntitled)).toEqual([false, false])
    expect(userService.isAdmin).not.toHaveBeenCalled()
  })
})
