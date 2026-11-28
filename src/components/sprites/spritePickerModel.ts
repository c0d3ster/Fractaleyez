import { AppConfig } from '../../config/configDefaults'
import { Quota } from '../../config/plans.config'
import { LibraryUpload } from './uploadLibrary'

/**
 * The picker's sources, one shown at a time. A premium `create` source (inline image generation) and video clips are meant
 * to join this list later; each source only has to produce tiles for the same grid.
 */
export type SpriteSource = 'builtin' | 'yours'

export const SPRITE_SOURCES: readonly { id: SpriteSource; label: string }[] = [
  { id: 'builtin', label: 'Built-in' },
  { id: 'yours', label: 'Yours' },
]

/**
 * Two rows, so the panel's height never changes with the number of images. At least four across, which is what fits the
 * expanded config window's narrow columns (about 27px tiles); a wider space, like the sidebar, fits more tiles of about 40px.
 */
export const GRID_ROWS = 2
export const GRID_MIN_COLUMNS = 4
export const TILE_TARGET_PX = 40
export const TILE_GAP_PX = 4
/** The mobile shell's tiles are bigger for a finger: six across a phone's sheet (about 54px each on a 375px wide phone). */
export const TOUCH_TILE_TARGET_PX = 52

/** How many columns the grid gets at `width`: as many tiles of about `target` px as fit, never fewer than four. */
export const columnsFor = (width: number, target = TILE_TARGET_PX): number =>
  Math.max(GRID_MIN_COLUMNS, Math.floor((width + TILE_GAP_PX) / (target + TILE_GAP_PX)))

/** Beyond this many pages the pager shows `3 / 13` instead of a dot per page, which would no longer fit. */
export const MAX_PAGE_DOTS = 7

export type SpriteTile =
  | { type: 'add' }
  | { type: 'reference' }
  | { type: 'image'; src: string; uploadId: string | null; isLogo: boolean }

type YoursTilesInput = {
  uploads: readonly LibraryUpload[]
  /** The viewer's saved logo (settings.logoParticle). Usually one of their uploads (the avatar copy), drawn once either way. */
  logoUrl: string | undefined
  isAdmin: boolean
}

/** The Yours grid: the upload tile first, then `@user` for admins, the logo, then the uploads newest first. */
export const yoursTiles = ({ uploads, logoUrl, isAdmin }: YoursTilesInput): SpriteTile[] => {
  const logoUpload = logoUrl ? uploads.find((u) => u.url === logoUrl) : undefined
  const logoTile: SpriteTile[] = logoUrl && !logoUpload ? [{ type: 'image', src: logoUrl, uploadId: null, isLogo: true }] : []
  return [
    { type: 'add' },
    ...(isAdmin ? [{ type: 'reference' } as const] : []),
    ...logoTile,
    ...uploads.map((u): SpriteTile => ({ type: 'image', src: u.url, uploadId: u.id, isLogo: u.url === logoUrl })),
  ]
}

export const builtinTiles = (sprites: readonly string[]): SpriteTile[] =>
  sprites.map((src) => ({ type: 'image', src, uploadId: null, isLogo: false }))

export const pageCount = (count: number, size: number): number => Math.max(1, Math.ceil(count / size))

/** The page's items; a page past the end (after a delete) shows the last page instead. */
export const pageItems = <T>(items: readonly T[], page: number, size: number): T[] => {
  const last = pageCount(items.length, size) - 1
  const current = Math.min(Math.max(0, page), last)
  return items.slice(current * size, (current + 1) * size)
}

export const clampPage = (page: number, count: number, size: number): number =>
  Math.min(Math.max(0, page), pageCount(count, size) - 1)

/** `4/15` under the upload tile's +, or `4/∞` on an unlimited plan. */
export const uploadCountLabel = (used: number, limit: Quota): string => `${used}/${limit === null ? '∞' : limit}`

/** True while the live (unsaved) config draws `url`: deleting it would break what is on screen. */
export const usedByLiveConfig = (config: Pick<AppConfig, 'particle' | 'logo'> | undefined, url: string): boolean =>
  !!config && (config.particle.sprites.value.includes(url) || config.logo.sprite.value.includes(url))
