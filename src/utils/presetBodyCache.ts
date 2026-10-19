/**
 * Preset configs fetched by id, kept in localStorage so a preset opens without a request and still opens offline.
 * Each entry remembers the preset's `updatedAt` from when it was fetched: the preset list carries the current one, and
 * a copy whose `updatedAt` differs is out of date and is fetched again.
 */
export type CachedPresetBody = {
  config: Record<string, unknown>
  /** null for a legacy document, which counts as current as long as the list also says null. */
  updatedAt: string | null
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

// The key older builds already used, whose entries were bare configs with no updatedAt (see isCachedPresetBody).
const CACHE_KEY = 'presets'

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

// `'updatedAt' in` rather than truthiness: null is a valid value, and an old bare config has no such property at all.
const isCachedPresetBody = (value: unknown): value is CachedPresetBody =>
  isRecord(value) &&
  isRecord(value.config) &&
  'updatedAt' in value &&
  (value.updatedAt === null || typeof value.updatedAt === 'string')

// Storage can throw on access (disabled, private window), so even looking it up is guarded.
const defaultStorage = (): StorageLike | undefined => {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

const readBlob = (storage: StorageLike | undefined): Record<string, CachedPresetBody> => {
  try {
    const raw = storage?.getItem(CACHE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) {
      storage?.removeItem(CACHE_KEY)
      return {}
    }
    const entries = Object.entries(parsed)
    const valid = entries.filter((entry): entry is [string, CachedPresetBody] => isCachedPresetBody(entry[1]))
    // Old-format entries (bare configs, including a name-keyed `default`) are dropped once, so they never linger or get served.
    if (valid.length !== entries.length) storage?.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(valid)))
    return Object.fromEntries(valid)
  } catch {
    return {}
  }
}

export const readCachedPresetBody = (id: string, storage: StorageLike | undefined = defaultStorage()): CachedPresetBody | null =>
  readBlob(storage)[id] ?? null

export const writeCachedPresetBody = (id: string, entry: CachedPresetBody, storage: StorageLike | undefined = defaultStorage()): void => {
  try {
    storage?.setItem(CACHE_KEY, JSON.stringify({ ...readBlob(storage), [id]: entry }))
  } catch {
    // quota or disabled storage: the preset still loads, it just is not kept
  }
}

/** True when the cached copy is the one the list describes. With no list entry there is nothing to compare, so the copy is used. */
export const isCurrent = (cached: CachedPresetBody, listedUpdatedAt: string | null | undefined): boolean =>
  listedUpdatedAt === undefined || listedUpdatedAt === cached.updatedAt
