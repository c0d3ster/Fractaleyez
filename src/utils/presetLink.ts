import type { PackMeta, PresetMeta } from '../components/config/context/ConfigProvider'

/** The query param a shared link carries: `?preset=<pack slug>/<preset name>`, e.g. `?preset=reddit/fractal-dive`. */
export const PRESET_LINK_PARAM = 'preset'

/**
 * Mirrors toSlug in server/services/PackService.ts, which every stored pack slug went through, so a slug from the URL compares
 * equal to the stored one whatever its case.
 */
export const toSlug = (name: string): string =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/** Every pack a preset is listed under; the same reading as packsOf in Presets.tsx. */
const packsOf = ({ pack, packs }: PresetMeta): string[] => (packs?.length ? packs : pack ? [pack] : [])

/** Splits `pack/preset` into its two slugs. Null for anything else (no slash, an empty half, more than one slash). */
export const parsePresetLink = (value: string | null): { packSlug: string; presetSlug: string } | null => {
  if (!value) return null
  const parts = value.split('/')
  if (parts.length !== 2) return null
  // URLSearchParams has already decoded the value, so `fractal%20dive` arrives as `fractal dive`.
  const [packSlug, presetSlug] = parts.map(toSlug)
  if (!packSlug || !presetSlug) return null
  return { packSlug, presetSlug }
}

/**
 * The preset a shared link names: the pack is found by its slug, then the preset among that pack's presets whose name slugifies to
 * the link's. Both halves are case-insensitive. Null when either is missing, or when the preset is only in premium packs the viewer
 * can't use (a link never opens a preset the presets list wouldn't).
 */
export const resolvePresetLink = (value: string | null, presets: PresetMeta[], packs: PackMeta[]): PresetMeta | null => {
  const link = parsePresetLink(value)
  if (!link) return null
  const pack = packs.find(p => p.slug === link.packSlug)
  if (!pack) return null
  const preset = presets.find(p => packsOf(p).includes(pack.name) && toSlug(p.name) === link.presetSlug)
  if (!preset) return null
  const packByName = new Map(packs.map(p => [p.name, p]))
  const usable = packsOf(preset).some(name => {
    const listed = packByName.get(name)
    return !listed?.isPremium || listed.isEntitled
  })
  return usable ? preset : null
}

/** The shareable URL for a preset in a pack, on the current origin. */
export const presetLinkFor = (packSlug: string, presetName: string, origin = window.location.origin): string =>
  `${origin}/?${PRESET_LINK_PARAM}=${packSlug}/${toSlug(presetName)}`
