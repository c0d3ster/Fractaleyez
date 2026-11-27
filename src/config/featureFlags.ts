// Features that are built but not released yet. A flag is on when the build turns it on (the FEATURE_FLAGS env var, comma separated, read
// by webpack; every flag is on in a development build) or when this browser does: `?flags=fractalTypes` in the address turns it on and
// remembers it (the pop-out config window shares the memory), `?flags=-fractalTypes` turns it off again.

export const FEATURE_FLAGS = ['fractalTypes'] as const
export type FeatureFlag = typeof FEATURE_FLAGS[number]

const STORAGE_KEY = 'featureFlags'

const isFlag = (name: string): name is FeatureFlag => (FEATURE_FLAGS as readonly string[]).includes(name)

const parseList = (list: string | undefined | null): string[] => (list ?? '').split(',').map((name) => name.trim()).filter(Boolean)

/** The flags on for this page: the build's, plus this browser's, after the address's changes (which it saves). */
export const resolveFeatureFlags = (
  buildFlags: string | undefined,
  development: boolean,
  search: string,
  storage: Pick<Storage, 'getItem' | 'setItem'> | null,
): Set<FeatureFlag> => {
  let saved: string[] = []
  try {
    saved = JSON.parse(storage?.getItem(STORAGE_KEY) ?? '[]') as string[]
  } catch {
    saved = []
  }
  const local = new Set(saved.filter(isFlag))
  const changes = parseList(new URLSearchParams(search).get('flags'))
  changes.forEach((change) => {
    const off = change.startsWith('-')
    const name = off ? change.slice(1) : change
    if (!isFlag(name)) return
    if (off) local.delete(name)
    else local.add(name)
  })
  if (changes.length > 0) {
    try {
      storage?.setItem(STORAGE_KEY, JSON.stringify([...local]))
    } catch {
      // Storage can be unavailable (private mode); the address still applies to this page.
    }
  }
  const build = development ? [...FEATURE_FLAGS] : parseList(buildFlags).filter(isFlag)
  return new Set([...build, ...local])
}

const browserStorage = (): Storage | null => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

const enabled = resolveFeatureFlags(
  process.env.FEATURE_FLAGS,
  process.env.NODE_ENV === 'development',
  typeof window === 'undefined' ? '' : window.location.search,
  browserStorage(),
)

/** Whether a feature is on for this page. */
export const isFeatureEnabled = (flag: FeatureFlag): boolean => enabled.has(flag)
