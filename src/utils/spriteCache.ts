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

/** Best-effort: warms the resolved-URL map for the given sprite URLs. Never throws. */
export async function warmSpriteCache(urls: string[]): Promise<void> {
  const unique = [...new Set(urls)].filter(isRemoteUrl)
  await Promise.all(unique.map(resolveOne))
}

/** Synchronous lookup for use in the (sync) texture-loading path. Falls back to the original URL. */
export function getResolvedSpriteUrl(url: string): string {
  return resolvedUrls.get(url) ?? url
}
