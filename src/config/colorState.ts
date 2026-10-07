import { ColorConfigSection } from './configDefaults'
import { buildPaletteLut, isHexColor } from './paletteLut'
import { CUSTOM_PALETTE, PALETTE_BY_ID, RAINBOW_PALETTE } from './palettes'

/** The Color config boiled down for the renderers: plain numbers plus the palette's lookup tables. */
export type ColorState = {
  /** Changes whenever anything that affects the colors does; an unchanged config returns the same object. */
  key: string
  saturation: number
  /** The palette range handles (0..1). */
  rangeStart: number
  rangeEnd: number
  /** Where in the palette the colors start (0..1 of a pass). */
  phase: number
  /** How many times the fractal runs through the palette across its escape range. */
  cycles: number
  /** RGBA bytes of one pass through the palette as used: ranged, reversed and mirrored. */
  lut: Uint8Array
  /** The whole palette (reversed if asked, not cropped or mirrored), for the range bar the handles sit on. */
  baseLut: Uint8Array
}

const stopsFor = (color: ColorConfigSection): readonly string[] => {
  const id = color.palette.value[0]
  const stops = id === CUSTOM_PALETTE ? color.customStops.value.filter(isHexColor) : PALETTE_BY_ID[id ?? RAINBOW_PALETTE]?.stops
  // An unknown palette (saved by a newer version) or a custom one with too few colors falls back to the rainbow.
  return stops && stops.length >= 2 ? stops : PALETTE_BY_ID[RAINBOW_PALETTE]?.stops ?? []
}

let cached: ColorState | null = null

/** Resolves the live Color config. Cheap enough to call every frame: the palette is only rebuilt when something changed. */
export const resolveColorState = (color: ColorConfigSection): ColorState => {
  const { saturation, rangeStart, rangeEnd, palettePhase, paletteCycles, paletteReverse, paletteMirror } = color
  const stops = stopsFor(color)
  const key = [
    saturation.value, rangeStart.value, rangeEnd.value, palettePhase.value, paletteCycles.value,
    paletteReverse.value, paletteMirror.value, stops.join(','),
  ].join('|')
  if (cached?.key === key) return cached
  cached = {
    key,
    saturation: saturation.value,
    rangeStart: rangeStart.value,
    rangeEnd: rangeEnd.value,
    phase: palettePhase.value,
    cycles: paletteCycles.value,
    lut: buildPaletteLut(stops, { reverse: paletteReverse.value, mirror: paletteMirror.value, start: rangeStart.value, end: rangeEnd.value }),
    baseLut: buildPaletteLut(stops, { reverse: paletteReverse.value, mirror: false }),
  }
  return cached
}
