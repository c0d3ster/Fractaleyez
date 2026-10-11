import { USER_REFERENCE } from './userReference'

/**
 * Resolves a stored `sprite` value to something an <img>/TextureLoader can load directly.
 * Priority: an R2 URL (absolute `https://<R2_PUBLIC_URL>/...`, stored verbatim on preset save —
 * no key-to-URL table needed) → an existing `/public` path from before the R2 migration →
 * any other already-absolute `data:`/`blob:`/`http(s):` reference, passed through unchanged.
 */
export const presetSpriteSrc = (sprite: string): string => {
  // An unresolved `@user` reference (e.g. a saved preset's thumbnail) has no per-user logo outside the visualizer.
  if (!sprite || sprite === USER_REFERENCE) return '/fractaleye.png'
  if (
    sprite.startsWith('http://') ||
    sprite.startsWith('https://') ||
    sprite.startsWith('data:') ||
    sprite.startsWith('blob:')
  ) {
    return sprite
  }
  return sprite.startsWith('/') ? sprite : `/${sprite}`
}
