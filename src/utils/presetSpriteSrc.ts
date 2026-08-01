/**
 * Resolves a stored `sprite` value to something an <img>/TextureLoader can load directly.
 * Priority: an R2 URL (absolute `https://<R2_PUBLIC_URL>/...`, stored verbatim on preset save —
 * no key-to-URL table needed) → an existing `/public` path from before the R2 migration →
 * any other already-absolute `data:`/`blob:`/`http(s):` reference, passed through unchanged.
 */
export function presetSpriteSrc(sprite: string): string {
  if (!sprite) return '/fractaleye.png'
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
