import { ColorState } from '../../config/colorState'
import { sampleLut } from '../../config/paletteLut'
import { particleConfig } from '../../config/particle.config'
import { userConfig } from '../../config/user.config'

export const TAU = Math.PI * 2
export const RADIUS = 44

// Each arm starts at the core, runs out to the rim and curls by up to this much (less when the arms are packed close).
const ARM_INNER_RADIUS = 5
const ARM_OUTER_RADIUS = RADIUS - 3
const ARM_MAX_CURL = TAU * (50 / 360)
const ARM_SAMPLES = 14
// Cyclone turns the inside and the outside of the galaxy opposite ways; this is the distance along an arm where they part.
export const CYCLONE_SPLIT = 0.5
// Each arm is a cloud of stars along its curve. The total stays roughly level as arms are added.
const STAR_BUDGET = 240
const STARS_PER_ARM_MIN = 6
const STARS_PER_ARM_MAX = 40
// Extra tiny stars off each arm, as a share of its main stars.
const STRAY_RATIO = 0.8
const CLOUDS_PER_ARM_MIN = 3
const CLOUDS_PER_ARM_MAX = 8

// The dots and clouds are drawn at their natural size when Scale is at its default, and shrink or grow from there.
const SCALE_EXPONENT = 0.7
const DOT_SCALE_MIN = 0.45
const DOT_SCALE_MAX = 1.5
// Particle size runs far wider than Scale does (1 to 200), so it is eased down to a modest range around the default.
const STAR_SIZE_EXPONENT = 0.35
const STAR_SCALE_MIN = 0.6
const STAR_SCALE_MAX = 1.8
// Palettes that start or end near black would lose their stars against the dark sky, so colors are lifted to at least this brightness.
const MIN_LUMA = 0.5

/**
 * Switcheroo swaps the galaxy between two shapes on a beat. The second winds the other way round and scatters
 * differently, so the change reads at a glance. `seed` moves every star to a fresh spot.
 */
export type ShapeVariant = 0 | 1

const SHAPES: Readonly<Record<ShapeVariant, { curl: number; spread: number; seed: number }>> = {
  0: { curl: 1, spread: 1, seed: 0 },
  1: { curl: -0.8, spread: 1.25, seed: 5000 },
}

export type ArmStar = {
  x: number
  y: number
  radius: number
  opacity: number
  /** How far out along the arm (0 at the core, 1 at the rim); the palette and the Cyclone split are read from it. */
  along: number
}

export type Arm = {
  /** The faint glow under the arm, cut in two at the Cyclone split. */
  glowInner: string
  glowOuter: string
  stars: ArmStar[]
  /** Soft, blurred clouds that give the arm body. */
  clouds: ArmStar[]
}

export type Look = {
  dotScale: number
  /** Extra size for the main stars only, from Particle size. */
  starScale: number
}

export const dotScaleOf = (scale: number): number =>
  Math.max(DOT_SCALE_MIN, Math.min(DOT_SCALE_MAX, (scale / userConfig.scaleFactor_DEFAULT) ** SCALE_EXPONENT))

export const starScaleOf = (particleSize: number): number =>
  Math.max(STAR_SCALE_MIN, Math.min(STAR_SCALE_MAX, (particleSize / particleConfig.size_DEFAULT) ** STAR_SIZE_EXPONENT))

export const starsPerArm = (count: number): number => Math.max(STARS_PER_ARM_MIN, Math.min(STARS_PER_ARM_MAX, Math.round(STAR_BUDGET / count)))

export type Rgb = readonly [number, number, number]

/** One channel (0..1) blended toward its luma by the saturation, then lifted toward white; returned as 0..255. */
const shade = (channel: number, luma: number, saturation: number, lift: number): number => {
  const base = luma + (channel - luma) * saturation
  return Math.round((base + (1 - base) * lift) * 255)
}

/** The palette color `along` the arm, desaturated like the renderers do and lifted so it shows on the dark sky. */
export const paletteRgb = ({ lut, phase, cycles, saturation }: ColorState, along: number): Rgb => {
  const [red, green, blue] = sampleLut(lut, phase + along * cycles)
  const luma = 0.299 * red + 0.587 * green + 0.114 * blue
  const lift = luma < MIN_LUMA ? (MIN_LUMA - luma) / (1 - luma) : 0
  return [shade(red, luma, saturation, lift), shade(green, luma, saturation, lift), shade(blue, luma, saturation, lift)]
}

export const toCss = ([red, green, blue]: Rgb): string => `rgb(${red} ${green} ${blue})`

const towardWhite = (channel: number, amount: number): number => Math.round(channel + (255 - channel) * amount)

/** Mixes a color toward white, `amount` 0..1. */
export const lighten = ([red, green, blue]: Rgb, amount: number): Rgb => [towardWhite(red, amount), towardWhite(green, amount), towardWhite(blue, amount)]

/** A repeatable pseudo-random value in [0, 1), so every arm gets the same scatter and mirrored arms stay exact reflections. */
export const noise = (seed: number): number => {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453
  return value - Math.floor(value)
}

/**
 * Color Shift: how far arm `index`'s colors have slid along the palette after `beats` beats. Before the first beat they
 * have not moved, so the galaxy looks exactly as it does with the effect off; each beat then drops every arm at a fresh
 * random spot, so the same colors turn up in different places, as the visualizer re-rolls each layer's hue.
 */
export const colorShiftOffset = (index: number, beats: number): number => (beats === 0 ? 0 : noise(index * 7.31 + beats * 13.17))

// Angle `t` runs counterclockwise from straight up, the same way the shader lays its wedges out.
export const coords = (t: number, radius: number): { x: number; y: number } => ({ x: -radius * Math.sin(t), y: -radius * Math.cos(t) })

const point = (t: number, radius: number): string => {
  const { x, y } = coords(t, radius)
  return `${x.toFixed(2)} ${y.toFixed(2)}`
}

/**
 * The spiral arm of wedge `index`: it leaves the core along the wedge's middle and curls to one side. Wedge 1 is wedge
 * 0 reflected, so odd arms curl the other way, which is how the mirroring shows without needing a lopsided symbol.
 */
export const armOf = (index: number, wedge: number, starCount: number, { dotScale, starScale }: Look, variant: ShapeVariant): Arm => {
  const shape = SHAPES[variant]
  const seed = (offset: number): number => noise(offset + shape.seed)
  const middle = (index + 0.5) * wedge
  const side = index % 2 === 0 ? 1 : -1
  const curl = Math.min(ARM_MAX_CURL, wedge * 0.8) * shape.curl * side
  const spread = Math.min(wedge * 0.6, 0.5) * shape.spread
  const starSize = Math.max(0.5, Math.min(1.6, wedge * 5)) * dotScale * starScale
  const centerline = (along: number): { t: number; radius: number } => ({
    t: middle + curl * along ** 1.4,
    radius: ARM_INNER_RADIUS + (ARM_OUTER_RADIUS - ARM_INNER_RADIUS) * along,
  })
  const glow = (from: number, to: number): string => Array.from({ length: to - from + 1 }, (_, s) => {
    const { t, radius } = centerline((from + s) / ARM_SAMPLES)
    return `${s === 0 ? 'M' : 'L'} ${point(t, radius)}`
  }).join(' ')
  const splitSample = Math.round(CYCLONE_SPLIT * ARM_SAMPLES)

  // Stars crowd toward the core and thin out toward the rim, scattered more widely, smaller and fainter as they go.
  const arm = Array.from({ length: starCount }, (_, s): ArmStar => {
    const along = (s + seed(s + 1)) / starCount
    const { t, radius } = centerline(along)
    const { x, y } = coords(t + (seed(s + 101) - 0.5) * spread * (0.3 + 1.3 * along) * side, radius)
    return {
      x,
      y,
      radius: starSize * (0.5 + seed(s + 201)) * (1 - 0.55 * along),
      opacity: Math.max(0.25, Math.min(1, 0.95 - 0.45 * along + (seed(s + 301) - 0.5) * 0.25)),
      along,
    }
  })
  // Strays: tiny dim dots well off the curve, so the arm trails off into the sky instead of ending on a line.
  const strays = Array.from({ length: Math.round(starCount * STRAY_RATIO) }, (_, s): ArmStar => {
    const along = 0.15 + 0.85 * seed(s + 401)
    const { t, radius } = centerline(along)
    const { x, y } = coords(t + (seed(s + 501) - 0.5) * Math.min(wedge * 0.9, 1) * shape.spread * side, radius)
    return { x, y, radius: (0.3 + 0.35 * seed(s + 601)) * dotScale, opacity: 0.25 + 0.3 * seed(s + 701), along: 0.6 + 0.4 * seed(s + 801) }
  })
  // Clouds sit on the curve, bigger toward the rim, and are blurred together when drawn. Packed arms get smaller ones.
  const cloudSize = Math.min(1, wedge * 2.2) * dotScale
  const cloudCount = Math.max(CLOUDS_PER_ARM_MIN, Math.min(CLOUDS_PER_ARM_MAX, Math.round(starCount / 3)))
  const clouds = Array.from({ length: cloudCount }, (_, s): ArmStar => {
    const along = 0.1 + 0.85 * ((s + seed(s + 901)) / cloudCount)
    const { t, radius } = centerline(along)
    const { x, y } = coords(t + (seed(s + 1001) - 0.5) * spread * 0.6 * side, radius)
    return { x, y, radius: (3 + 6 * along) * cloudSize, opacity: 0.3 + 0.2 * seed(s + 1101), along: Math.min(1, along * 1.1) }
  })
  return { glowInner: glow(0, splitSample), glowOuter: glow(splitSample, ARM_SAMPLES), stars: [...arm, ...strays], clouds }
}
