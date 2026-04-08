/** Public path like `sprites/foo.png`, or inlined `data:image/...` / blob / absolute URLs from saved presets */
export function presetSpriteSrc(sprite: string): string {
  if (!sprite) return '/fractaleye.png'
  if (
    sprite.startsWith('data:') ||
    sprite.startsWith('blob:') ||
    sprite.startsWith('http://') ||
    sprite.startsWith('https://')
  ) {
    return sprite
  }
  return sprite.startsWith('/') ? sprite : `/${sprite}`
}
