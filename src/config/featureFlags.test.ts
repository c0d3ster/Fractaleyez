import { describe, expect, it } from 'vitest'
import { resolveFeatureFlags } from './featureFlags'

const memoryStorage = (initial: Record<string, string> = {}): Pick<Storage, 'getItem' | 'setItem'> & { data: Record<string, string> } => {
  const data = { ...initial }
  return { data, getItem: (key) => data[key] ?? null, setItem: (key, value) => { data[key] = value } }
}

describe('resolveFeatureFlags', () => {
  it('is off in production unless the build turns it on', () => {
    expect(resolveFeatureFlags(undefined, false, '', memoryStorage()).has('fractalTypes')).toBe(false)
    expect(resolveFeatureFlags('fractalTypes', false, '', memoryStorage()).has('fractalTypes')).toBe(true)
  })

  it('is on in a development build', () => {
    expect(resolveFeatureFlags(undefined, true, '', memoryStorage()).has('fractalTypes')).toBe(true)
  })

  it('lets the address turn a flag on for this browser and remembers it, and turn it off again', () => {
    const storage = memoryStorage()
    expect(resolveFeatureFlags(undefined, false, '?flags=fractalTypes', storage).has('fractalTypes')).toBe(true)
    expect(resolveFeatureFlags(undefined, false, '', storage).has('fractalTypes')).toBe(true)
    expect(resolveFeatureFlags(undefined, false, '?flags=-fractalTypes', storage).has('fractalTypes')).toBe(false)
    expect(resolveFeatureFlags(undefined, false, '', storage).has('fractalTypes')).toBe(false)
  })

  it('ignores unknown names and broken storage', () => {
    const storage = memoryStorage({ featureFlags: 'not json' })
    expect([...resolveFeatureFlags('nope', false, '?flags=other', storage)]).toEqual([])
  })
})
