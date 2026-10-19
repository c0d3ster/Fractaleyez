import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Types } from 'mongoose'
import { PresetMeta } from '../repositories/PresetRepository'
import { presetRepository } from '../repositories/PresetRepository'
import { IPreset } from '../models/Preset'
import { defaultFirst, PresetService, toUpdatedAt } from './PresetService'
import { userService } from './UserService'

vi.mock('../repositories/PresetRepository', () => ({
  presetRepository: { create: vi.fn(), upsert: vi.fn(), findAll: vi.fn() },
}))
vi.mock('./UserService', () => ({
  userService: { isAdmin: vi.fn() },
}))

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
    const list = await new PresetService().listPresetsForViewer(null)
    expect(list.map((p) => [p.name, p.updatedAt])).toEqual([['default', null], ['pointerz', '2026-10-19T12:30:00.000Z']])
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
    vi.mocked(userService.isAdmin).mockReset().mockResolvedValue(false)
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
    vi.mocked(userService.isAdmin).mockResolvedValue(true)
    await expect(save(['@user', 'a.png'])).resolves.toBe(saved)
    await expect(save(['@user'], true)).resolves.toBe(saved)
    expect(userService.isAdmin).toHaveBeenCalledWith('user_1')
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
      vi.mocked(userService.isAdmin).mockResolvedValue(true)
      await expect(saveLogo(['@user'])).resolves.toBe(saved)
    })

    it('leaves a plain logo sprite alone and skips the admin lookup', async () => {
      await expect(saveLogo(['logo.png'])).resolves.toBe(saved)
      expect(userService.isAdmin).not.toHaveBeenCalled()
    })
  })

  it('leaves presets without @user alone and skips the admin lookup', async () => {
    await expect(save(['a.png'])).resolves.toBe(saved)
    await expect(save(['a.png'], true)).resolves.toBe(saved)
    expect(userService.isAdmin).not.toHaveBeenCalled()
  })
})
