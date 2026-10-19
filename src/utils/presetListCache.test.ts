import { describe, it, expect } from 'vitest'
import { ApiPack, ApiPreset, clearPresetListCache, readPresetListCache, updatePresetListCache } from './presetListCache'

const makeStorage = (initial: Record<string, string> = {}): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> & { data: Map<string, string> } => {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (key: string): string | null => data.get(key) ?? null,
    setItem: (key: string, value: string): void => {
      data.set(key, value)
    },
    removeItem: (key: string): void => {
      data.delete(key)
    },
  }
}

const preset: ApiPreset = { id: 'p1', name: 'fire', pack: 'Elemental', sprite: 'fire.png', isOwn: false, updatedAt: '2026-10-19T12:00:00.000Z' }
const pack: ApiPack = { id: 'k1', name: 'Elemental', slug: 'elemental', isPremium: false, isOwn: false }

describe('presetListCache', () => {
  it('reads back what was written for the same viewer', () => {
    const storage = makeStorage()
    updatePresetListCache('user_1', { presets: [preset], packs: [pack] }, storage)
    const cached = readPresetListCache('user_1', storage)
    expect(cached?.presets).toEqual([preset])
    expect(cached?.packs).toEqual([pack])
  })

  it('keeps the other list when only one is updated', () => {
    const storage = makeStorage()
    updatePresetListCache(null, { presets: [preset] }, storage)
    updatePresetListCache(null, { packs: [pack] }, storage)
    const cached = readPresetListCache(null, storage)
    expect(cached?.presets).toEqual([preset])
    expect(cached?.packs).toEqual([pack])
  })

  it('never serves one viewer the lists of another, and clears them', () => {
    const storage = makeStorage()
    updatePresetListCache('user_1', { presets: [preset], packs: [pack] }, storage)
    expect(readPresetListCache('user_2', storage)).toBeNull()
    expect(readPresetListCache(null, storage)).toBeNull()
    expect(storage.data.size).toBe(0)
  })

  it('replaces another viewer\'s cache instead of merging into it', () => {
    const storage = makeStorage()
    updatePresetListCache('user_1', { presets: [preset], packs: [pack] }, storage)
    updatePresetListCache(null, { presets: [] }, storage)
    expect(readPresetListCache(null, storage)?.packs).toEqual([])
  })

  it('treats corrupt or wrong-shaped data as no cache without throwing', () => {
    expect(readPresetListCache(null, makeStorage({ presetList: '{nope' }))).toBeNull()
    expect(readPresetListCache(null, makeStorage({ presetList: JSON.stringify({ viewerId: null, presets: [{ id: 1 }], packs: [], savedAt: 1 }) }))).toBeNull()
    // a list cached before presets carried updatedAt is not served
    const { updatedAt: _omitted, ...withoutUpdatedAt } = preset
    expect(readPresetListCache(null, makeStorage({ presetList: JSON.stringify({ viewerId: null, presets: [withoutUpdatedAt], packs: [], savedAt: 1 }) }))).toBeNull()
    expect(readPresetListCache(null, makeStorage({ presetList: JSON.stringify([1, 2]) }))).toBeNull()
  })

  it('does not throw when storage is missing or throws', () => {
    const broken = {
      getItem: (): string | null => {
        throw new Error('denied')
      },
      setItem: (): void => {
        throw new Error('quota')
      },
      removeItem: (): void => {
        throw new Error('denied')
      },
    }
    expect(readPresetListCache(null, broken)).toBeNull()
    expect(() => updatePresetListCache(null, { presets: [preset] }, broken)).not.toThrow()
    expect(() => clearPresetListCache(broken)).not.toThrow()
    expect(readPresetListCache(null, undefined)).toBeNull()
  })
})
