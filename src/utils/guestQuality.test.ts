import { describe, expect, it } from 'vitest'

import { readGuestQuality, writeGuestQuality } from './guestQuality'

type FakeStorage = Pick<Storage, 'getItem' | 'setItem'> & { data: Map<string, string> }

const makeStorage = (initial: Record<string, string> = {}): FakeStorage => {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (key: string): string | null => data.get(key) ?? null,
    setItem: (key: string, value: string): void => {
      data.set(key, value)
    },
  }
}

const throwing: Pick<Storage, 'getItem' | 'setItem'> = {
  getItem: (): string | null => {
    throw new Error('blocked')
  },
  setItem: (): void => {
    throw new Error('blocked')
  },
}

describe('guest quality', () => {
  it('reads back what was written', () => {
    const storage = makeStorage()
    expect(readGuestQuality(storage)).toBeNull()
    writeGuestQuality('saver', storage)
    expect(readGuestQuality(storage)).toBe('saver')
    writeGuestQuality('auto', storage)
    expect(readGuestQuality(storage)).toBe('auto')
  })

  it('ignores a value that is not a quality setting', () => {
    expect(readGuestQuality(makeStorage({ guestQuality: 'turbo' }))).toBeNull()
  })

  it('works with no storage or blocked storage', () => {
    expect(readGuestQuality(undefined)).toBeNull()
    expect(readGuestQuality(throwing)).toBeNull()
    expect(() => writeGuestQuality('ultra', throwing)).not.toThrow()
  })
})
