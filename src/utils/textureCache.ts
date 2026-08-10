import * as THREE from 'three'

const FALLBACK_SPRITE_URL = '/fractaleye.png'

type CacheEntry = {
  texture: THREE.Texture
  refCount: number
}

const cache = new Map<string, CacheEntry>()
const urlByTexture = new WeakMap<THREE.Texture, string>()

// TextureLoader.load() fails asynchronously via its onError callback (e.g. a CORS-blocked
// R2 request never fires onLoad) -- a try/catch around .load() can't see that. Catch it here
// and fall back to the bundled sprite so a bad sprite URL doesn't leave particles blank.
const loadTexture = (url: string): THREE.Texture => {
  const texture = new THREE.TextureLoader().load(url, undefined, undefined, (error) => {
    console.warn(`Failed to load particle sprite "${url}", falling back to default`, error)
    new THREE.TextureLoader().load(FALLBACK_SPRITE_URL, (fallback) => {
      texture.image = fallback.image
      texture.needsUpdate = true
    })
  })
  return texture
}

/**
 * A single preset spreads a handful of sprite URLs across dozens of layer/level particle
 * systems, and mid-crossfade the outgoing and incoming visualizer can both be pointing at the
 * same URL at once -- so textures are refcounted rather than owned by one material, and are
 * only disposed (freeing the GPU upload) once every acquirer has released it.
 */
export const acquireSpriteTexture = (url: string): THREE.Texture => {
  const existing = cache.get(url)
  if (existing) {
    existing.refCount++
    return existing.texture
  }

  const texture = loadTexture(url)
  cache.set(url, { texture, refCount: 1 })
  urlByTexture.set(texture, url)
  return texture
}

/** Releases one reference to a texture acquired via `acquireSpriteTexture`, disposing it once unused. Safe to call on any texture -- one not tracked by the cache is disposed directly. */
export const releaseSpriteTexture = (texture: THREE.Texture): void => {
  const url = urlByTexture.get(texture)
  if (!url) {
    texture.dispose()
    return
  }

  const entry = cache.get(url)
  if (!entry) return

  entry.refCount--
  if (entry.refCount <= 0) {
    entry.texture.dispose()
    cache.delete(url)
    urlByTexture.delete(texture)
  }
}
