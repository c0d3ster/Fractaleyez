import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Types } from 'mongoose'
import { PresetMeta } from '../repositories/PresetRepository.js'
import { presetRepository } from '../repositories/PresetRepository.js'
import { packRepository, PackMeta } from '../repositories/PackRepository.js'
import { IPreset } from '../models/Preset.js'
import { defaultFirst, PresetService, toUpdatedAt } from './PresetService.js'
import { userRepository } from '../repositories/UserRepository.js'
import { IUser, PlanId } from '../models/User.js'

// The real EntitlementService runs against these, so the tests cover the quota rules end to end down to the counts.
vi.mock('../repositories/PresetRepository.js', () => ({
  presetRepository: { create: vi.fn(), upsert: vi.fn(), findAll: vi.fn(), countByUserId: vi.fn(), existsForUser: vi.fn() },
}))
vi.mock('../repositories/PackRepository.js', () => ({
  packRepository: { findAll: vi.fn(), countByUserId: vi.fn() },
}))
vi.mock('../repositories/UploadRepository.js', () => ({
  uploadRepository: { countByUserId: vi.fn() },
}))
vi.mock('../repositories/UserRepository.js', () => ({
  userRepository: { findByClerkId: vi.fn() },
}))

const asUser = (plan: PlanId, isAdmin = false): void => {
  vi.mocked(userRepository.findByClerkId).mockResolvedValue({ clerkId: 'user_1', plan, isAdmin } as unknown as IUser)
}

const row = (name: string, userId?: string): PresetMeta => ({
  _id: new Types.ObjectId(),
  name,
  sprite: 'galaxySprite.png',
  userId,
})

const names = (rows: PresetMeta[]): string[] => rows.map((r) => r.name)

describe('defaultFirst', () => {
  it('moves the global default to the front and keeps the rest in their original order', () => {
    const rows = [row('pointerz'), row('circles'), row('default'), row('notes')]
    expect(names(defaultFirst(rows))).toEqual(['default', 'pointerz', 'circles', 'notes'])
  })

  it('leaves a list that already starts with the default unchanged', () => {
    const rows = [row('default'), row('pointerz')]
    expect(names(defaultFirst(rows))).toEqual(['default', 'pointerz'])
  })

  it('does not pin a user-owned preset that happens to be named default', () => {
    const rows = [row('pointerz'), row('default', 'user_1'), row('default')]
    const result = defaultFirst(rows)
    expect(result[0]).toBe(rows[2])
    expect(names(result)).toEqual(['default', 'pointerz', 'default'])
  })

  it('returns the list as-is when there is no default', () => {
    const rows = [row('pointerz'), row('circles')]
    expect(names(defaultFirst(rows))).toEqual(['pointerz', 'circles'])
  })
})

describe('updatedAt', () => {
  it('is an ISO string for a timestamped document and null for a legacy one', () => {
    expect(toUpdatedAt(new Date('2026-10-19T12:30:00.000Z'))).toBe('2026-10-19T12:30:00.000Z')
    expect(toUpdatedAt(undefined)).toBeNull()
  })

  it('is listed for every preset, so a client can tell which cached copies are out of date', async () => {
    const stamped = { ...row('pointerz'), updatedAt: new Date('2026-10-19T12:30:00.000Z') }
    vi.mocked(presetRepository.findAll).mockResolvedValue([row('default'), stamped])
    vi.mocked(packRepository.findAll).mockResolvedValue([])
    const list = await new PresetService().listPresetsForViewer(null)
    expect(list.map((p) => [p.name, p.updatedAt])).toEqual([['default', null], ['pointerz', '2026-10-19T12:30:00.000Z']])
  })
})

describe('pack membership', () => {
  const pack = (name: string, presetIds: Types.ObjectId[]): PackMeta => ({ _id: new Types.ObjectId(), name, slug: name, userId: 'u', isPremium: false, presetIds })

  it('lists a preset under every pack that references it, and falls back to the legacy pack string', async () => {
    const shared = { ...row('@userSpin'), pack: '@user' }
    const legacy = { ...row('fire'), pack: 'Elemental' }
    vi.mocked(presetRepository.findAll).mockResolvedValue([shared, legacy])
    vi.mocked(packRepository.findAll).mockResolvedValue([pack('Essentials', [shared._id]), pack('@user', [shared._id])])
    const list = await new PresetService().listPresetsForViewer(null)
    expect(list.map((p) => [p.name, p.packs])).toEqual([['@userSpin', ['Essentials', '@user']], ['fire', ['Elemental']]])
  })
})

describe('PresetService#savePreset @user gate', () => {
  const service = new PresetService()
  const saved = { _id: 'p1', name: 'x' } as unknown as IPreset
  const save = (sprites: unknown, force = false): Promise<IPreset> =>
    service.savePreset({ name: 'x', pack: '', config: { particle: { sprites } }, userId: 'user_1', force })

  beforeEach(() => {
    vi.mocked(presetRepository.create).mockReset().mockResolvedValue(saved)
    vi.mocked(presetRepository.upsert).mockReset().mockResolvedValue(saved)
    vi.mocked(presetRepository.countByUserId).mockReset().mockResolvedValue(0)
    vi.mocked(presetRepository.existsForUser).mockReset().mockResolvedValue(false)
    asUser('free')
  })

  it('rejects a non-admin saving a preset containing @user with a 403', async () => {
    await expect(save(['@user', 'a.png'])).rejects.toMatchObject({
      status: 403,
      message: 'Only admins can create presets that use @user',
    })
    expect(presetRepository.create).not.toHaveBeenCalled()
  })

  it('rejects @user in the older { value: [...] } shape too', async () => {
    await expect(save({ value: ['a.png', '@user'] })).rejects.toMatchObject({ status: 403 })
  })

  it('gates the force upsert path', async () => {
    await expect(save(['@user'], true)).rejects.toMatchObject({ status: 403 })
    expect(presetRepository.upsert).not.toHaveBeenCalled()
  })

  it('lets an admin save @user, on both paths', async () => {
    asUser('free', true)
    await expect(save(['@user', 'a.png'])).resolves.toBe(saved)
    await expect(save(['@user'], true)).resolves.toBe(saved)
    expect(userRepository.findByClerkId).toHaveBeenCalledWith('user_1')
  })

  describe('logo.sprite', () => {
    const saveLogo = (sprite: unknown, force = false): Promise<IPreset> =>
      service.savePreset({ name: 'x', pack: '', config: { particle: { sprites: ['a.png'] }, logo: { sprite } }, userId: 'user_1', force })

    it('rejects a non-admin saving @user in the logo list, on both paths', async () => {
      await expect(saveLogo(['@user'])).rejects.toMatchObject({ status: 403 })
      await expect(saveLogo(['@user'], true)).rejects.toMatchObject({ status: 403 })
      expect(presetRepository.create).not.toHaveBeenCalled()
      expect(presetRepository.upsert).not.toHaveBeenCalled()
    })

    it('rejects @user in the older { value: [...] } logo shape too', async () => {
      await expect(saveLogo({ value: ['@user'] })).rejects.toMatchObject({ status: 403 })
    })

    it('lets an admin save @user in the logo list', async () => {
      asUser('free', true)
      await expect(saveLogo(['@user'])).resolves.toBe(saved)
    })

    it('leaves a plain logo sprite alone', async () => {
      await expect(saveLogo(['logo.png'])).resolves.toBe(saved)
    })
  })

  it('leaves presets without @user alone', async () => {
    await expect(save(['a.png'])).resolves.toBe(saved)
    await expect(save(['a.png'], true)).resolves.toBe(saved)
  })
})

describe('PresetService#savePreset quota', () => {
  const service = new PresetService()
  const saved = { _id: 'p1', name: 'x' } as unknown as IPreset
  const save = (force = false): Promise<IPreset> =>
    service.savePreset({ name: 'x', pack: '', config: { particle: { sprites: ['a.png'] } }, userId: 'user_1', force })

  beforeEach(() => {
    vi.mocked(presetRepository.create).mockReset().mockResolvedValue(saved)
    vi.mocked(presetRepository.upsert).mockReset().mockResolvedValue(saved)
    vi.mocked(presetRepository.existsForUser).mockReset().mockResolvedValue(false)
    vi.mocked(presetRepository.countByUserId).mockReset()
    asUser('free')
  })

  it('lets a Dream user save up to the limit', async () => {
    vi.mocked(presetRepository.countByUserId).mockResolvedValue(2)
    await expect(save()).resolves.toBe(saved)
  })

  it('refuses a new preset at the limit, on both paths, with the quota details', async () => {
    vi.mocked(presetRepository.countByUserId).mockResolvedValue(3)
    const refused = { status: 403, quota: 'savedPresets', limit: 3, plan: 'free' }
    await expect(save()).rejects.toMatchObject(refused)
    await expect(save(true)).rejects.toMatchObject(refused)
    expect(presetRepository.create).not.toHaveBeenCalled()
    expect(presetRepository.upsert).not.toHaveBeenCalled()
  })

  it('always lets an existing preset be overwritten, even over the limit after a downgrade', async () => {
    vi.mocked(presetRepository.countByUserId).mockResolvedValue(9)
    vi.mocked(presetRepository.existsForUser).mockResolvedValue(true)
    await expect(save(true)).resolves.toBe(saved)
    expect(presetRepository.countByUserId).not.toHaveBeenCalled()
  })

  it('raises the limit for Lucid and lifts it for Third Eye and admins', async () => {
    vi.mocked(presetRepository.countByUserId).mockResolvedValue(9)
    asUser('tier1')
    await expect(save()).resolves.toBe(saved)
    vi.mocked(presetRepository.countByUserId).mockResolvedValue(10)
    await expect(save()).rejects.toMatchObject({ quota: 'savedPresets', limit: 10, plan: 'tier1' })
    asUser('tier2')
    await expect(save()).resolves.toBe(saved)
    asUser('free', true)
    await expect(save()).resolves.toBe(saved)
  })

  it('treats a user with no document as Dream', async () => {
    vi.mocked(userRepository.findByClerkId).mockResolvedValue(null)
    vi.mocked(presetRepository.countByUserId).mockResolvedValue(3)
    await expect(save()).rejects.toMatchObject({ limit: 3, plan: 'free' })
  })
})
