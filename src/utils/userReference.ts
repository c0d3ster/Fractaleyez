/** Reserved sentinel a preset's particle list can hold; resolved per user at load time, never saved resolved. */
export const USER_REFERENCE = '@user'

const APP_DEFAULT_SPRITE = 'fractaleye.png'
const TEXT_SPRITE_SIZE_PX = 512
const TEXT_SPRITE_MAX_FONT_PX = 160
const TEXT_SPRITE_PADDING_PX = 24

export type UserReferenceContext = {
  /** Persisted per-user logo (manual upload, or the processed Clerk social photo). */
  logoParticle?: string | null
  displayName?: string | null
}

type ResolveOptions = {
  /** Renders the display name to a sprite-compatible URL. Injectable so the chain is testable without a DOM. */
  renderText?: (text: string) => string
}

/** Renders `text` centered on a transparent square canvas as a `data:` URL; '' when no canvas is available. */
export const renderTextSprite = (text: string): string => {
  if (typeof document === 'undefined') return ''
  const canvas = document.createElement('canvas')
  canvas.width = TEXT_SPRITE_SIZE_PX
  canvas.height = TEXT_SPRITE_SIZE_PX
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  const maxWidth = TEXT_SPRITE_SIZE_PX - TEXT_SPRITE_PADDING_PX * 2
  const fontFor = (px: number): string => `700 ${px}px sans-serif`
  ctx.font = fontFor(TEXT_SPRITE_MAX_FONT_PX)
  const measured = ctx.measureText(text).width
  const fontPx = measured > maxWidth
    ? Math.max(8, Math.floor(TEXT_SPRITE_MAX_FONT_PX * (maxWidth / measured)))
    : TEXT_SPRITE_MAX_FONT_PX

  ctx.font = fontFor(fontPx)
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, TEXT_SPRITE_SIZE_PX / 2, TEXT_SPRITE_SIZE_PX / 2, maxWidth)
  return canvas.toDataURL('image/png')
}

/**
 * Fallback chain for one `@user` particle: persisted logo → display name as text → the preset's own
 * fallback particle → app default. Signed out, the first two are absent and the rest still resolve.
 * (A Clerk social photo is not a separate rung: it is processed and persisted into `logoParticle`.)
 */
export const resolveUserParticle = (
  { logoParticle, displayName }: UserReferenceContext,
  presetFallback: string | undefined,
  { renderText = renderTextSprite }: ResolveOptions = {},
): string => {
  if (logoParticle) return logoParticle
  const name = displayName?.trim()
  const rendered = name ? renderText(name) : ''
  if (rendered) return rendered
  return presetFallback || APP_DEFAULT_SPRITE
}

/**
 * What stands in for `@user` in a resolved sprite list. `collapsed` means the stand-in equals a sprite the preset
 * already lists (e.g. the preset fallback), so the list holds it once and it can't be told apart from the real one.
 */
export type UserReferenceState = { resolved: string; collapsed: boolean }

/** Replaces `@user` in a sprite list. `reference` is null when the list has no sentinel. */
export const resolveUserSprites = (
  sprites: string[],
  context: UserReferenceContext,
  options?: ResolveOptions,
): { sprites: string[]; reference: UserReferenceState | null } => {
  if (!sprites.includes(USER_REFERENCE)) return { sprites, reference: null }
  const presetFallback = sprites.find(s => s !== USER_REFERENCE)
  const resolved = resolveUserParticle(context, presetFallback, options)
  const others = sprites.filter(s => s !== USER_REFERENCE)
  const mapped = [...new Set(sprites.map(s => (s === USER_REFERENCE ? resolved : s)))]
  return { sprites: mapped, reference: { resolved, collapsed: others.includes(resolved) } }
}

/** Moves a resolved list from its current stand-in to `next` (user data arrived after the preset loaded). */
export const swapUserReference = (
  sprites: string[],
  { resolved, collapsed }: UserReferenceState,
  next: string,
): { sprites: string[]; reference: UserReferenceState } => {
  if (collapsed) {
    const nextCollapsed = sprites.includes(next)
    return { sprites: nextCollapsed ? sprites : [next, ...sprites], reference: { resolved: next, collapsed: nextCollapsed } }
  }
  const others = sprites.filter(s => s !== resolved)
  const mapped = [...new Set(sprites.map(s => (s === resolved ? next : s)))]
  return { sprites: mapped, reference: { resolved: next, collapsed: others.includes(next) } }
}

/** Inverse of resolveUserSprites for saving: puts the sentinel back so a preset never stores one user's logo. */
export const restoreUserReference = (sprites: string[], reference: UserReferenceState | null): string[] => {
  if (!reference) return sprites
  if (reference.collapsed) return sprites.includes(USER_REFERENCE) ? sprites : [USER_REFERENCE, ...sprites]
  return sprites.map(s => (s === reference.resolved ? USER_REFERENCE : s))
}
