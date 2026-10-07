/**
 * Palette color math: a palette is an ordered list of hex stops, baked into a small lookup table (RGBA bytes) that the
 * Orbit samples on the CPU and the Fractal shader samples as a texture. Stops are blended in OKLab, so gradients
 * between far-apart colors stay clean instead of going muddy the way plain RGB blends do.
 */

import { rangePosition } from './paletteRange'

export const LUT_SIZE = 256

export type Rgb = [number, number, number]

export type PaletteShape = {
  reverse: boolean
  /** Play the colors forward then back, so a palette that does not loop on its own has no seam where it wraps. */
  mirror: boolean
  /** The palette range handles (0..1); an end before the start wraps through the seam. Whole palette when left out. */
  start?: number
  end?: number
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i

export const isHexColor = (value: string): boolean => HEX_COLOR.test(value)

const fract = (value: number): number => value - Math.floor(value)

/** Parses #rrggbb to 0..1 sRGB channels, or null for anything else. */
export const parseHex = (hex: string): Rgb | null => {
  if (!isHexColor(hex)) return null
  return [
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  ]
}

const toLinear = (channel: number): number => (channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4))
const toSrgb = (channel: number): number => (channel <= 0.0031308 ? channel * 12.92 : 1.055 * Math.pow(channel, 1 / 2.4) - 0.055)

const rgbToOklab = ([red, green, blue]: Rgb): Rgb => {
  const r = toLinear(red)
  const g = toLinear(green)
  const b = toLinear(blue)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

const oklabToRgb = ([lightness, a, b]: Rgb): Rgb => {
  const l = Math.pow(lightness + 0.3963377774 * a + 0.2158037573 * b, 3)
  const m = Math.pow(lightness - 0.1055613458 * a - 0.0638541728 * b, 3)
  const s = Math.pow(lightness - 0.0894841775 * a - 1.291485548 * b, 3)
  const clamp = (value: number): number => Math.min(1, Math.max(0, value))
  return [
    toSrgb(clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)),
    toSrgb(clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)),
    toSrgb(clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)),
  ]
}

/** The colors in play order: reversed if asked, then mirrored back to the first one so the loop closes. */
export const arrangeStops = <T>(stops: readonly T[], { reverse, mirror }: Pick<PaletteShape, 'reverse' | 'mirror'>): T[] => {
  const ordered = reverse ? [...stops].reverse() : [...stops]
  return mirror ? [...ordered, ...ordered.slice(0, -1).reverse()] : ordered
}

/** How finely the cropped range is cut before it is reversed, mirrored and baked. */
const RANGE_STEPS = 256

/** Blends along a list of OKLab colors, `position` running from 0 (first) to 1 (last). */
const blendAlong = (colors: readonly Rgb[], position: number): Rgb => {
  const last = colors.length - 1
  if (last < 1) return colors[0] ?? [0, 0, 0]
  const scaled = Math.min(Math.max(position, 0), 1) * last
  const index = Math.min(Math.floor(scaled), last - 1)
  const from = colors[index] ?? [0, 0, 0]
  const to = colors[index + 1] ?? from
  const blend = scaled - index
  return [from[0] + (to[0] - from[0]) * blend, from[1] + (to[1] - from[1]) * blend, from[2] + (to[2] - from[2]) * blend]
}

/**
 * Bakes stops into `size` RGBA bytes spanning one pass through the palette: the range is cut out of the stops, then
 * reversed and mirrored. The last entry stops one step short of the end, so a palette that already ends where it
 * starts wraps without a repeated color.
 */
export const buildPaletteLut = (stops: readonly string[], shape: PaletteShape, size: number = LUT_SIZE): Uint8Array => {
  const colors = stops.flatMap((hex): Rgb[] => {
    const rgb = parseHex(hex)
    return rgb ? [rgbToOklab(rgb)] : []
  })
  const { start = 0, end = 1 } = shape
  const range = Array.from({ length: RANGE_STEPS }, (_, i) => blendAlong(colors, rangePosition(start, end, i / (RANGE_STEPS - 1))))
  const played = arrangeStops(range, shape)
  const lut = new Uint8Array(size * 4)
  for (let i = 0; i < size; i++) {
    const [red, green, blue] = oklabToRgb(blendAlong(played, i / size))
    lut[i * 4] = Math.round(red * 255)
    lut[i * 4 + 1] = Math.round(green * 255)
    lut[i * 4 + 2] = Math.round(blue * 255)
    lut[i * 4 + 3] = 255
  }
  return lut
}

/** Reads the palette at a position (wrapping), blending the two nearest entries. Channels are 0..1. */
export const sampleLut = (lut: Uint8Array, position: number): Rgb => {
  const size = lut.length / 4
  const scaled = fract(position) * size
  const first = Math.floor(scaled) % size
  const second = (first + 1) % size
  const blend = scaled - Math.floor(scaled)
  const channel = (offset: number): number => ((lut[first * 4 + offset] ?? 0) * (1 - blend) + (lut[second * 4 + offset] ?? 0) * blend) / 255
  return [channel(0), channel(1), channel(2)]
}

/** A CSS gradient of the palette starting `offset` of the way in and running through it `cycles` times, for previews. */
export const lutToCssGradient = (lut: Uint8Array, offset: number = 0, cycles: number = 1): string => {
  const samples = Math.ceil(24 * Math.max(cycles, 1))
  const colors = Array.from({ length: samples + 1 }, (_, i) => {
    const [red, green, blue] = sampleLut(lut, offset + (i / samples) * cycles)
    return `rgb(${Math.round(red * 255)}, ${Math.round(green * 255)}, ${Math.round(blue * 255)}) ${((i / samples) * 100).toFixed(1)}%`
  })
  return `linear-gradient(to right, ${colors.join(', ')})`
}
