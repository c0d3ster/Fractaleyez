import { describe, it, expect } from 'vitest'
import { isCurrent, readCachedPresetBody, writeCachedPresetBody } from './presetBodyCache'

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

describe('presetBodyCache', () => {
  it('reads back a written entry, including a null updatedAt', () => {
    const storage = makeStorage()
    writeCachedPresetBody('a', { config: { user: { speed: 2 } }, updatedAt: '2026-10-19T00:00:00.000Z' }, storage)
    writeCachedPresetBody('b', { config: {}, updatedAt: null }, storage)
    expect(readCachedPresetBody('a', storage)).toEqual({ config: { user: { speed: 2 } }, updatedAt: '2026-10-19T00:00:00.000Z' })
    expect(readCachedPresetBody('b', storage)?.updatedAt).toBeNull()
    expect(readCachedPresetBody('missing', storage)).toBeNull()
  })

  it('drops old bare-config entries on first read, once, and never serves them', () => {
    const storage = makeStorage({
      presets: JSON.stringify({
        default: { user: { speed: 2 } },
        abc: { user: { speed: 3 } },
        good: { config: { user: {} }, updatedAt: null },
      }),
    })
    expect(readCachedPresetBody('default', storage)).toBeNull()
    expect(readCachedPresetBody('abc', storage)).toBeNull()
    expect(Object.keys(JSON.parse(storage.data.get('presets') ?? '{}'))).toEqual(['good'])
    expect(readCachedPresetBody('good', storage)).not.toBeNull()
  })

  it('treats a corrupt or non-object blob as empty without throwing', () => {
    expect(readCachedPresetBody('a', makeStorage({ presets: '{nope' }))).toBeNull()
    const storage = makeStorage({ presets: '[1,2]' })
    expect(readCachedPresetBody('a', storage)).toBeNull()
    expect(storage.data.has('presets')).toBe(false)
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
    expect(readCachedPresetBody('a', broken)).toBeNull()
    expect(() => writeCachedPresetBody('a', { config: {}, updatedAt: null }, broken)).not.toThrow()
    expect(readCachedPresetBody('a', undefined)).toBeNull()
  })
})

describe('isCurrent', () => {
  const cached = { config: {}, updatedAt: '2026-10-19T00:00:00.000Z' }

  it('is current when the list reports the same updatedAt, and stale when it differs', () => {
    expect(isCurrent(cached, '2026-10-19T00:00:00.000Z')).toBe(true)
    expect(isCurrent(cached, '2026-10-20T00:00:00.000Z')).toBe(false)
  })

  it('counts null on both sides as current, so a legacy document never refetches in a loop', () => {
    expect(isCurrent({ config: {}, updatedAt: null }, null)).toBe(true)
    expect(isCurrent({ config: {}, updatedAt: null }, '2026-10-19T00:00:00.000Z')).toBe(false)
  })

  it('uses the cached copy when the list has no entry to compare', () => {
    expect(isCurrent(cached, undefined)).toBe(true)
  })
})
