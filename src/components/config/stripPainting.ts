import { Arm, GLOW_ALONG, lighten, Rgb, TAU } from './kaleidoscopeGalaxy'

/** The arm glow's own opacity, as the dial's stylesheet sets it for the SVG version. */
const GLOW_STROKE_OPACITY = 0.3
// The core's light: how much each stop is lifted toward white, how opaque it is, and where along the radius it sits.
const CORE_STOPS: readonly { at: number, lift: number, alpha: number }[] = [
  { at: 0, lift: 0.7, alpha: 1 },
  { at: 0.35, lift: 0.25, alpha: 0.75 },
]

/** Where a strip sits: the rectangle it shows (in the dial's drawing units, from its center), and how the galaxy is moved into it. */
export type StripPlacement = {
  left: number
  top: number
  right: number
  bottom: number
  /** How far the galaxy slides along the strips' axis, and whether it is flipped over on that axis. */
  shift: number
  flip: boolean
}

/** What one frame of the strips is drawn from. The dial builds one on every render; the timer draws from the latest. */
export type StripScene = {
  /** The plain galaxy's arms; every strip shows a slice of it. */
  arms: readonly Arm[]
  /** The galaxy's own opacity (the ghost of the mirrored picture is fainter). */
  opacity: number
  glowWidth: number
  /** How soft the haze of all the strips together is, in drawing units. */
  hazeBlur: number
  /** The palette color `along` an arm, as a CSS color. */
  colorOf: (along: number, armIndex: number) => string
  coreRgb: Rgb
  coreRadius: number
  /** The galaxy is cut to a disc this big, in drawing units. */
  clipRadius: number
  /** Strips side by side (shifted across), rather than stacked (shifted down). */
  vertical: boolean
  strips: readonly StripPlacement[]
}

/** How far the haze and the stars have turned. */
export type StripAngles = { haze: number, stars: number }

/** Where a canvas of `size` pixels puts the dial's drawing units: its center, and pixels per unit. */
export type StripFrame = { size: number, center: number, unit: number }

const rgba = ([red, green, blue]: Rgb, alpha: number): string => `rgba(${red}, ${green}, ${blue}, ${alpha})`

/**
 * The whole galaxy at the given turn, the haze (to be blurred as one by the caller) on one canvas and the sharp stars on
 * another. Each strip is then cut from these, so the work does not grow with the number of strips.
 */
export const paintGalaxy = (haze: CanvasRenderingContext2D, stars: CanvasRenderingContext2D, scene: StripScene, angles: StripAngles, { size, center, unit }: StripFrame): void => {
  haze.clearRect(0, 0, size, size)
  stars.clearRect(0, 0, size, size)
  const turn = (ctx: CanvasRenderingContext2D, angle: number): void => {
    ctx.save()
    ctx.translate(center, center)
    ctx.rotate(angle)
    ctx.scale(unit, unit)
  }
  turn(haze, angles.haze)
  haze.beginPath()
  haze.arc(0, 0, scene.clipRadius, 0, TAU)
  haze.clip()
  haze.lineCap = 'round'
  haze.lineJoin = 'round'
  haze.lineWidth = scene.glowWidth
  scene.arms.forEach((arm, index) => {
    haze.globalAlpha = GLOW_STROKE_OPACITY
    haze.strokeStyle = scene.colorOf(GLOW_ALONG.inner, index)
    haze.stroke(new Path2D(arm.glowInner))
    haze.strokeStyle = scene.colorOf(GLOW_ALONG.outer, index)
    haze.stroke(new Path2D(arm.glowOuter))
    arm.clouds.forEach(({ x, y, radius, opacity, along }) => {
      haze.globalAlpha = opacity
      haze.fillStyle = scene.colorOf(along, index)
      haze.beginPath()
      haze.arc(x, y, radius, 0, TAU)
      haze.fill()
    })
  })
  haze.restore()
  turn(stars, angles.stars)
  scene.arms.forEach((arm, index) => {
    arm.stars.forEach(({ x, y, radius, opacity, along }) => {
      stars.globalAlpha = opacity
      stars.fillStyle = scene.colorOf(along, index)
      stars.beginPath()
      stars.arc(x, y, radius, 0, TAU)
      stars.fill()
    })
  })
  stars.restore()
}

/** Draws the core's light at the dial's center, in whatever transform the context has. */
const paintCore = (ctx: CanvasRenderingContext2D, scene: StripScene, unit: number): void => {
  const radius = scene.coreRadius * unit
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius)
  CORE_STOPS.forEach(({ at, lift, alpha }) => gradient.addColorStop(at, rgba(lighten(scene.coreRgb, lift), alpha)))
  gradient.addColorStop(1, rgba(scene.coreRgb, 0))
  ctx.globalAlpha = scene.opacity
  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.arc(0, 0, radius, 0, TAU)
  ctx.fill()
}

/** Cuts every strip from the painted galaxy onto `target`, moved and flipped the way the SVG strips are; `withCore` also puts the core's light in each. */
export const paintStrips = (target: CanvasRenderingContext2D, galaxy: CanvasImageSource, scene: StripScene, { size, center, unit }: StripFrame, withCore: boolean): void => {
  target.clearRect(0, 0, size, size)
  scene.strips.forEach(({ left, top, right, bottom, shift, flip }) => {
    target.save()
    target.beginPath()
    target.rect(center + left * unit, center + top * unit, (right - left) * unit, (bottom - top) * unit)
    target.clip()
    target.translate(center, center)
    target.translate(scene.vertical ? shift * unit : 0, scene.vertical ? 0 : shift * unit)
    if (flip) target.scale(scene.vertical ? -1 : 1, scene.vertical ? 1 : -1)
    // The galaxy's own opacity applies to the picture as a whole, as it does to the SVG layer, so overlapping stars do not add up past it.
    target.globalAlpha = scene.opacity
    target.drawImage(galaxy, -center, -center)
    if (withCore) paintCore(target, scene, unit)
    target.restore()
  })
}
