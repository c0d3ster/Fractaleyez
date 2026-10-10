import { describe, it, expect, vi } from 'vitest'
import { Types } from 'mongoose'
import { PresetMeta } from '../repositories/PresetRepository'
import { defaultFirst } from './PresetService'

vi.mock('../repositories/PresetRepository', () => ({
  presetRepository: {},
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
