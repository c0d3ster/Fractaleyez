import { ColorConfigSection } from './configDefaults'
import { buildPaletteLut, isHexColor } from './paletteLut'
import { CUSTOM_PALETTE, PALETTE_BY_ID, RAINBOW_PALETTE } from './palettes'

/** The Color config boiled down for the renderers: plain numbers plus the palette's lookup table (null for the rainbow). */
export type ColorState = {
  /** Changes whenever anything that affects the colors does; an unchanged config returns the same object. */
  key: string
  saturation: number
  hueStart: number
  hueSpan: number
  /** Where in the palette the colors start (0..1 of a pass). */
  phase: number
  /** How many times the fractal runs through the palette across its escape range. */
  cycles: number
  /** RGBA bytes of one pass through the palette, or null when the rainbow is in use. */
  lut: Uint8Array | null
}

const stopsFor = (color: ColorConfigSection): readonly string[] | null => {
  const id = color.palette.value[0]
  if (!id || id === RAINBOW_PALETTE) return null
  const stops = id === CUSTOM_PALETTE ? color.customStops.value.filter(isHexColor) : PALETTE_BY_ID[id]?.stops
  // An unknown palette (saved by a newer version) or a custom one with too few colors falls back to the rainbow.
  return stops && stops.length >= 2 ? stops : null
}

let cached: ColorState | null = null

/** Resolves the live Color config. Cheap enough to call every frame: the palette is only rebuilt when something changed. */
export const resolveColorState = (color: ColorConfigSection): ColorState => {
  const { saturation, hueStart, hueSpan, palettePhase, paletteCycles, paletteReverse, paletteMirror } = color
  const stops = stopsFor(color)
  const key = [
    saturation.value, hueStart.value, hueSpan.value, palettePhase.value, paletteCycles.value,
    paletteReverse.value, paletteMirror.value, stops?.join(',') ?? RAINBOW_PALETTE,
  ].join('|')
  if (cached?.key === key) return cached
  cached = {
    key,
    saturation: saturation.value,
    hueStart: hueStart.value,
    hueSpan: hueSpan.value,
    phase: palettePhase.value,
    cycles: paletteCycles.value,
    lut: stops ? buildPaletteLut(stops, { reverse: paletteReverse.value, mirror: paletteMirror.value }) : null,
  }
  return cached
}
