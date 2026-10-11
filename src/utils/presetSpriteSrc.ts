import { USER_REFERENCE } from './userReference'

const DEFAULT_SPRITE_SRC = '/fractaleye.png'

/**
 * Resolves a stored `sprite` value to something an <img>/TextureLoader can load directly.
 * Priority: an R2 URL (absolute `https://<R2_PUBLIC_URL>/...`, stored verbatim on preset save —
 * no key-to-URL table needed) → an existing `/public` path from before the R2 migration →
 * any other already-absolute `data:`/`blob:`/`http(s):` reference, passed through unchanged.
 * A bare `@user` resolves to `userSprite` (the viewer's own logo) when given, else the default sprite.
 */
export const presetSpriteSrc = (sprite: string, userSprite?: string): string => {
  if (sprite === USER_REFERENCE) return userSprite ? presetSpriteSrc(userSprite) : DEFAULT_SPRITE_SRC
  if (!sprite) return DEFAULT_SPRITE_SRC
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
