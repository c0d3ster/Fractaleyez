/** What `/api/presets` returns for one preset. */
export type ApiPreset = {
  id: string
  name: string
  pack: string
  sprite: string
  isOwn: boolean
  /** ISO time of the preset's last write; null for a legacy document. A cached copy of its config is current while this is unchanged. */
  updatedAt: string | null
}

/** What `/api/packs` returns for one pack. */
export type ApiPack = {
  id: string
  name: string
  slug: string
  isPremium: boolean
  isOwn: boolean
}

/**
 * The last successful preset and pack lists, kept so a reload with the API unreachable still shows real data.
 * It belongs to one viewer (`null` is signed out): another viewer never reads it, since private presets are in it.
 */
export type PresetListCache = {
  viewerId: string | null
  presets: ApiPreset[]
  packs: ApiPack[]
  savedAt: number
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const CACHE_KEY = 'presetList'

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

const isApiPreset = (value: unknown): value is ApiPreset =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.name === 'string' &&
  typeof value.pack === 'string' &&
  typeof value.sprite === 'string' &&
  typeof value.isOwn === 'boolean' &&
  'updatedAt' in value &&
  (value.updatedAt === null || typeof value.updatedAt === 'string')

const isApiPack = (value: unknown): value is ApiPack =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.name === 'string' &&
  typeof value.slug === 'string' &&
  typeof value.isPremium === 'boolean' &&
  typeof value.isOwn === 'boolean'

const isPresetListCache = (value: unknown): value is PresetListCache =>
  isRecord(value) &&
  (value.viewerId === null || typeof value.viewerId === 'string') &&
  Array.isArray(value.presets) &&
  value.presets.every(isApiPreset) &&
  Array.isArray(value.packs) &&
  value.packs.every(isApiPack) &&
  typeof value.savedAt === 'number'

// Storage can throw on access (disabled, private window), so even looking it up is guarded.
const defaultStorage = (): StorageLike | undefined => {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

export const clearPresetListCache = (storage: StorageLike | undefined = defaultStorage()): void => {
  try {
    storage?.removeItem(CACHE_KEY)
  } catch {
    // nothing to clear
  }
}

/** The viewer's cached lists, or null when there are none, they are corrupt, or they belong to someone else (which clears them). */
export const readPresetListCache = (viewerId: string | null, storage: StorageLike | undefined = defaultStorage()): PresetListCache | null => {
  try {
    const raw = storage?.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!isPresetListCache(parsed)) return null
    if (parsed.viewerId !== viewerId) {
      clearPresetListCache(storage)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

/** Writes one list over the viewer's cache, keeping the other as it was. A cache that belongs to someone else is replaced. */
export const updatePresetListCache = (
  viewerId: string | null,
  lists: Partial<Pick<PresetListCache, 'presets' | 'packs'>>,
  storage: StorageLike | undefined = defaultStorage(),
): void => {
  try {
    const current = readPresetListCache(viewerId, storage)
    const next: PresetListCache = {
      viewerId,
      presets: lists.presets ?? current?.presets ?? [],
      packs: lists.packs ?? current?.packs ?? [],
      savedAt: Date.now(),
    }
    storage?.setItem(CACHE_KEY, JSON.stringify(next))
  } catch {
    // quota or disabled storage: the live lists still work
  }
}
