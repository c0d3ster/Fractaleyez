// Keeps R2-hosted particle sprites available with zero network access (live shows may have
// none). Uses the browser's persistent Cache Storage API directly — no service worker needed,
// pages can read/write named caches on their own. Resolution is synchronous at the point of use
// (`getResolvedSpriteUrl`) because THREE.TextureLoader is called from a synchronous code path;
// `warmSpriteCache` runs ahead of time (on boot, and whenever the active sprite list changes) to
// populate the in-memory map that lookup reads from.
const CACHE_NAME = 'fractaleyez-particle-sprites-v1'

const resolvedUrls = new Map<string, string>()

const isRemoteUrl = (url: string): boolean => url.startsWith('http://') || url.startsWith('https://')

const cachesAvailable = (): boolean => typeof caches !== 'undefined'

async function resolveOne(url: string): Promise<void> {
  if (!isRemoteUrl(url) || resolvedUrls.has(url)) return
  if (!cachesAvailable()) return

  try {
    const cache = await caches.open(CACHE_NAME)
    let response = await cache.match(url)
    if (!response) {
      response = await fetch(url)
      if (!response.ok) return
      await cache.put(url, response.clone())
    }
    const blob = await response.blob()
    resolvedUrls.set(url, URL.createObjectURL(blob))
  } catch {
    // Offline and not yet cached — nothing to do; getResolvedSpriteUrl falls back to `url`.
  }
}

/**
 * Drops resolved entries no longer referenced by the active sprite list: revokes their blob:
 * URLs and removes them from Cache Storage, so switching sprite sets over a long-running session
 * (a live show) doesn't leak object URLs or grow the cache without bound.
 */
async function evictStale(activeUrls: string[]): Promise<void> {
  const active = new Set(activeUrls)
  const stale = [...resolvedUrls.keys()].filter((url) => !active.has(url))
  if (stale.length === 0) return

  const cache = cachesAvailable() ? await caches.open(CACHE_NAME).catch(() => null) : null
  for (const url of stale) {
    const blobUrl = resolvedUrls.get(url)
    if (blobUrl) URL.revokeObjectURL(blobUrl)
    resolvedUrls.delete(url)
    await cache?.delete(url).catch(() => false)
  }
}

/** Best-effort: warms the resolved-URL map for the given sprite URLs and evicts stale entries. Never throws. */
export async function warmSpriteCache(urls: string[]): Promise<void> {
  const unique = [...new Set(urls)].filter(isRemoteUrl)
  await Promise.all(unique.map(resolveOne))
  await evictStale(unique)
}

/** Synchronous lookup for use in the (sync) texture-loading path. Falls back to the original URL. */
export function getResolvedSpriteUrl(url: string): string {
  return resolvedUrls.get(url) ?? url
}
