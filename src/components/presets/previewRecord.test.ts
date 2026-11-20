import { describe, it, expect } from 'vitest'
import {
  PREVIEW_RECORD_KEY,
  hasPreviewed,
  isPreviewedToday,
  localDay,
  parsePreviewRecord,
  readPreviewRecord,
  recordPreview,
  withPreviewed,
} from './previewRecord'

class MemoryStorage {
  readonly items = new Map<string, string>()
  getItem = (key: string): string | null => this.items.get(key) ?? null
  setItem = (key: string, value: string): void => {
    this.items.set(key, value)
  }
}

const throwing = {
  getItem: (): string | null => {
    throw new Error('blocked')
  },
  setItem: (): void => {
    throw new Error('blocked')
  },
}

// Local times, so the tests hold in any time zone.
const morning = new Date(2026, 10, 20, 8, 0)
const lateNight = new Date(2026, 10, 20, 23, 59)
const nextDay = new Date(2026, 10, 21, 0, 1)

describe('localDay', () => {
  it('is the local calendar day, zero padded', () => {
    expect(localDay(new Date(2026, 0, 5, 12))).toBe('2026-01-05')
    expect(localDay(morning)).toBe(localDay(lateNight))
    expect(localDay(nextDay)).toBe('2026-11-21')
  })
})

describe('parsePreviewRecord', () => {
  it('keeps a record from today', () => {
    expect(parsePreviewRecord('{"day":"2026-11-20","presets":["a","b"]}', '2026-11-20')).toEqual({ day: '2026-11-20', presets: ['a', 'b'] })
  })

  it('starts over for a record from another day', () => {
    expect(parsePreviewRecord('{"day":"2026-11-19","presets":["a"]}', '2026-11-20')).toEqual({ day: '2026-11-20', presets: [] })
  })

  it('starts over for missing, malformed or wrongly shaped data, and drops non-string entries', () => {
    const empty = { day: '2026-11-20', presets: [] }
    expect(parsePreviewRecord(null, '2026-11-20')).toEqual(empty)
    expect(parsePreviewRecord('{not json', '2026-11-20')).toEqual(empty)
    expect(parsePreviewRecord('null', '2026-11-20')).toEqual(empty)
    expect(parsePreviewRecord('{"day":"2026-11-20","presets":"a"}', '2026-11-20')).toEqual(empty)
    expect(parsePreviewRecord('{"day":"2026-11-20","presets":["a",3,null]}', '2026-11-20')).toEqual({ day: '2026-11-20', presets: ['a'] })
  })
})

describe('withPreviewed', () => {
  it('adds a preset once', () => {
    const record = withPreviewed(withPreviewed({ day: 'd', presets: [] }, 'a'), 'a')
    expect(record.presets).toEqual(['a'])
    expect(hasPreviewed(record, 'a')).toBe(true)
    expect(hasPreviewed(record, 'b')).toBe(false)
  })
})

describe('recordPreview and isPreviewedToday', () => {
  it('remembers a preview for the rest of the local day and forgets it the next', () => {
    const storage = new MemoryStorage()
    expect(isPreviewedToday('a', morning, storage)).toBe(false)
    recordPreview('a', morning, storage)
    expect(isPreviewedToday('a', lateNight, storage)).toBe(true)
    expect(isPreviewedToday('b', lateNight, storage)).toBe(false)
    expect(isPreviewedToday('a', nextDay, storage)).toBe(false)
  })

  it('replaces an earlier day\'s record instead of adding to it', () => {
    const storage = new MemoryStorage()
    recordPreview('a', morning, storage)
    recordPreview('b', nextDay, storage)
    expect(JSON.parse(storage.items.get(PREVIEW_RECORD_KEY) ?? '')).toEqual({ day: '2026-11-21', presets: ['b'] })
  })

  it('never throws when storage is missing or blocked', () => {
    expect(() => recordPreview('a', morning, throwing)).not.toThrow()
    expect(readPreviewRecord(morning, throwing)).toEqual({ day: '2026-11-20', presets: [] })
    expect(isPreviewedToday('a', morning, null)).toBe(false)
    expect(() => recordPreview('a', morning, null)).not.toThrow()
  })
})
