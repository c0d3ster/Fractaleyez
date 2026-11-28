import { describe, expect, it } from 'vitest'

import { readStoredControlsMode, writeStoredControlsMode } from './storedControlsMode'

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

describe('stored controls mode', () => {
  it('reads back what was written', () => {
    const storage = makeStorage()
    expect(readStoredControlsMode(storage)).toBeNull()
    writeStoredControlsMode('none', storage)
    expect(readStoredControlsMode(storage)).toBe('none')
    writeStoredControlsMode('limited', storage)
    expect(readStoredControlsMode(storage)).toBe('limited')
  })

  it('ignores a value that is not a mode', () => {
    expect(readStoredControlsMode(makeStorage({ onScreenControls: 'minimal' }))).toBeNull()
  })

  it('survives blocked or missing storage', () => {
    expect(readStoredControlsMode(throwing)).toBeNull()
    expect(() => writeStoredControlsMode('none', throwing)).not.toThrow()
    expect(readStoredControlsMode(undefined)).toBeNull()
  })
})
