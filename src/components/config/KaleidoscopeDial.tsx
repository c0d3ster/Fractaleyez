import React, { useCallback, useEffect, useId, useMemo, useRef } from 'react'
import { particleConfig } from '../../config/particle.config'
import { ColorState } from '../../config/colorState'
import { sampleLut } from '../../config/paletteLut'
import { userConfig } from '../../config/user.config'
import './KaleidoscopeDial.css'

const TAU = Math.PI * 2
const RADIUS = 44
const HANDLE_RADIUS = 7
// Room around the rim so the handle and its halo are not clipped.
const VIEW_HALF = RADIUS + HANDLE_RADIUS + 2
// Pointer closer to the center than this has no meaningful angle.
const DEAD_ZONE = 6

// The knob turns clockwise from the top (the minimum) across this much of the circle, leaving a gap at the top so the
// maximum does not wrap straight back onto the minimum.
const SWEEP = TAU * (330 / 360)

// Each arm starts at the core, runs out to the rim and curls by up to this much (less when the arms are packed close).
const ARM_INNER_RADIUS = 5
const ARM_OUTER_RADIUS = RADIUS - 3
const ARM_MAX_CURL = TAU * (50 / 360)
const ARM_SAMPLES = 14
// Each arm is a cloud of stars along its curve. The total stays roughly level as arms are added.
const STAR_BUDGET = 240
const STARS_PER_ARM_MIN = 6
const STARS_PER_ARM_MAX = 40
// Extra tiny stars off each arm, as a share of its main stars.
const STRAY_RATIO = 0.8
const CLOUDS_PER_ARM_MIN = 3
const CLOUDS_PER_ARM_MAX = 8

// A fixed scatter of background stars, so the disc reads as a patch of sky.
const FIELD_STARS = Array.from({ length: 18 }, (_, i) => ({ angle: i * 2.39996, radius: 8 + ((i * 29) % 34) }))

type KaleidoscopeDialProps = {
  count: number
  min: number
  max: number
  step: number
  on: boolean
  /** The live Color config: the galaxy is painted with the palette, so changing it changes the dial. */
  palette: ColorState
  /** The Scale setting: bigger scale, bigger stars and clouds. */
  scale: number
  /** The Particle size setting: sets how big the stars are (the clouds and core follow Scale only). */
  particleSize: number
  /** The Glow effect: on, the haze and core shine; off, they are dim. */
  glow: boolean
  /** The Rotation setting: the galaxy turns at the rate the visualizers do, in the same direction as the sign. */
  rotationSpeed: number
  onChange: (count: number) => void
}

type ArmStar = {
  x: number
  y: number
  radius: number
  opacity: number
  color: string
}

type Arm = {
  path: string
  stars: ArmStar[]
  /** Soft, blurred clouds that give the arm body. */
  clouds: ArmStar[]
}

// The dots and clouds are drawn at their natural size when Scale is at its default, and shrink or grow from there.
const SCALE_EXPONENT = 0.7
const DOT_SCALE_MIN = 0.45
const DOT_SCALE_MAX = 1.5
// Palettes that start or end near black would lose their stars against the dark sky, so colors are lifted to at least this brightness.
const MIN_LUMA = 0.5

// Particle size runs far wider than Scale does (1 to 200), so it is eased down to a modest range around the default.
const STAR_SIZE_EXPONENT = 0.35
const STAR_SCALE_MIN = 0.6
const STAR_SCALE_MAX = 1.8
const HAZE_OPACITY_WITHOUT_GLOW = 0.45

const starScaleOf = (particleSize: number): number =>
  Math.max(STAR_SCALE_MIN, Math.min(STAR_SCALE_MAX, (particleSize / particleConfig.size_DEFAULT) ** STAR_SIZE_EXPONENT))

const dotScaleOf = (scale: number): number => Math.max(DOT_SCALE_MIN, Math.min(DOT_SCALE_MAX, (scale / userConfig.scaleFactor_DEFAULT) ** SCALE_EXPONENT))

type Look = {
  dotScale: number
  /** Extra size for the main stars only, from Particle size. */
  starScale: number
  /** The color a given distance out along an arm (0 at the core, 1 at the rim). */
  colorAt: (along: number) => string
}

type Rgb = readonly [number, number, number]

/** One channel (0..1) blended toward its luma by the saturation, then lifted toward white; returned as 0..255. */
const shade = (channel: number, luma: number, saturation: number, lift: number): number => {
  const base = luma + (channel - luma) * saturation
  return Math.round((base + (1 - base) * lift) * 255)
}

/** The palette color `along` the arm, desaturated like the renderers do and lifted so it shows on the dark sky. */
const paletteRgb = ({ lut, phase, cycles, saturation }: ColorState, along: number): Rgb => {
  const [red, green, blue] = sampleLut(lut, phase + along * cycles)
  const luma = 0.299 * red + 0.587 * green + 0.114 * blue
  const lift = luma < MIN_LUMA ? (MIN_LUMA - luma) / (1 - luma) : 0
  return [shade(red, luma, saturation, lift), shade(green, luma, saturation, lift), shade(blue, luma, saturation, lift)]
}

const toCss = ([red, green, blue]: Rgb): string => `rgb(${red} ${green} ${blue})`

const towardWhite = (channel: number, amount: number): number => Math.round(channel + (255 - channel) * amount)

/** Mixes a color toward white, `amount` 0..1. */
const lighten = ([red, green, blue]: Rgb, amount: number): Rgb => [towardWhite(red, amount), towardWhite(green, amount), towardWhite(blue, amount)]

/** A repeatable pseudo-random value in [0, 1), so every arm gets the same scatter and mirrored arms stay exact reflections. */
const noise = (seed: number): number => {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453
  return value - Math.floor(value)
}

// Angle `t` runs counterclockwise from straight up, the same way the shader lays its wedges out.
const coords = (t: number, radius: number): { x: number; y: number } => ({ x: -radius * Math.sin(t), y: -radius * Math.cos(t) })

const point = (t: number, radius: number): string => {
  const { x, y } = coords(t, radius)
  return `${x.toFixed(2)} ${y.toFixed(2)}`
}

/**
 * The spiral arm of wedge `index`: it leaves the core along the wedge's middle and curls to one side. Wedge 1 is wedge
 * 0 reflected, so odd arms curl the other way, which is how the mirroring shows without needing a lopsided symbol.
 */
const armOf = (index: number, wedge: number, starCount: number, { dotScale, starScale, colorAt }: Look): Arm => {
  const middle = (index + 0.5) * wedge
  const side = index % 2 === 0 ? 1 : -1
  const curl = Math.min(ARM_MAX_CURL, wedge * 0.8) * side
  const spread = Math.min(wedge * 0.6, 0.5)
  const starSize = Math.max(0.5, Math.min(1.6, wedge * 5)) * dotScale * starScale
  const centerline = (along: number): { t: number; radius: number } => ({
    t: middle + curl * along ** 1.4,
    radius: ARM_INNER_RADIUS + (ARM_OUTER_RADIUS - ARM_INNER_RADIUS) * along,
  })
  const path = Array.from({ length: ARM_SAMPLES + 1 }, (_, s) => {
    const { t, radius } = centerline(s / ARM_SAMPLES)
    return `${s === 0 ? 'M' : 'L'} ${point(t, radius)}`
  }).join(' ')
  // Stars crowd toward the core and thin out toward the rim, scattered more widely, smaller and fainter as they go.
  const arm = Array.from({ length: starCount }, (_, s): ArmStar => {
    const along = (s + noise(s + 1)) / starCount
    const { t, radius } = centerline(along)
    const { x, y } = coords(t + (noise(s + 101) - 0.5) * spread * (0.3 + 1.3 * along) * side, radius)
    return {
      x,
      y,
      radius: starSize * (0.5 + noise(s + 201)) * (1 - 0.55 * along),
      opacity: Math.max(0.25, Math.min(1, 0.95 - 0.45 * along + (noise(s + 301) - 0.5) * 0.25)),
      color: colorAt(along),
    }
  })
  // Strays: tiny dim dots well off the curve, so the arm trails off into the sky instead of ending on a line.
  const strays = Array.from({ length: Math.round(starCount * STRAY_RATIO) }, (_, s): ArmStar => {
    const along = 0.15 + 0.85 * noise(s + 401)
    const { t, radius } = centerline(along)
    const { x, y } = coords(t + (noise(s + 501) - 0.5) * Math.min(wedge * 0.9, 1) * side, radius)
    return { x, y, radius: (0.3 + 0.35 * noise(s + 601)) * dotScale, opacity: 0.25 + 0.3 * noise(s + 701), color: colorAt(0.6 + 0.4 * noise(s + 801)) }
  })
  // Clouds sit on the curve, bigger toward the rim, and are blurred together when drawn. Packed arms get smaller ones.
  const cloudSize = Math.min(1, wedge * 2.2) * dotScale
  const cloudCount = Math.max(CLOUDS_PER_ARM_MIN, Math.min(CLOUDS_PER_ARM_MAX, Math.round(starCount / 3)))
  const clouds = Array.from({ length: cloudCount }, (_, s): ArmStar => {
    const along = 0.1 + 0.85 * ((s + noise(s + 901)) / cloudCount)
    const { t, radius } = centerline(along)
    const { x, y } = coords(t + (noise(s + 1001) - 0.5) * spread * 0.6 * side, radius)
    return { x, y, radius: (3 + 6 * along) * cloudSize, opacity: 0.3 + 0.2 * noise(s + 1101), color: colorAt(along * 1.1) }
  })
  return { path, stars: [...arm, ...strays], clouds }
}

/** Drag position to a count: a knob, so the pointer's angle maps evenly across the range and the handle stays under it. */
const countAtPointer = (event: React.PointerEvent<SVGSVGElement>, { min, max, step }: Pick<KaleidoscopeDialProps, 'min' | 'max' | 'step'>): number | null => {
  const rect = event.currentTarget.getBoundingClientRect()
  const scale = rect.width / (VIEW_HALF * 2)
  const dx = event.clientX - (rect.left + rect.width / 2)
  const dy = event.clientY - (rect.top + rect.height / 2)
  if (Math.hypot(dx, dy) < DEAD_ZONE * scale) return null
  const angle = Math.atan2(dx, -dy)
  const clockwise = angle < 0 ? angle + TAU : angle
  // The gap at the top goes to whichever end is nearer.
  const along = clockwise <= SWEEP ? clockwise : clockwise > (SWEEP + TAU) / 2 ? 0 : SWEEP
  const snapped = min + Math.round(((along / SWEEP) * (max - min)) / step) * step
  return Math.max(min, Math.min(max, snapped))
}

/** The kaleidoscope's mirrors as a small galaxy: one spiral arm per wedge, curling opposite ways on alternate wedges. */
export const KaleidoscopeDial = React.memo(({ count, min, max, step, on, palette, scale, particleSize, glow, rotationSpeed, onChange }: KaleidoscopeDialProps): React.ReactElement => {
  const wedge = TAU / count
  // Unique per dial, since the filter, clip and gradient are referenced by id.
  const uid = useId().replace(/:/g, '')
  const dotScale = dotScaleOf(scale)
  const starScale = starScaleOf(particleSize)
  const spinRef = useRef<SVGGElement>(null)
  const angleRef = useRef(0)
  const arms = useMemo(() => {
    const starCount = Math.max(STARS_PER_ARM_MIN, Math.min(STARS_PER_ARM_MAX, Math.round(STAR_BUDGET / count)))
    const look: Look = { dotScale, starScale, colorAt: (along) => toCss(paletteRgb(palette, along)) }
    return Array.from({ length: count }, (_, i) => armOf(i, wedge, starCount, look))
  }, [count, wedge, dotScale, starScale, palette])
  const core = paletteRgb(palette, 0)
  const glowColor = toCss(paletteRgb(palette, 0.5))
  const glowWidth = Math.max(1.5, Math.min(6, wedge * 14)) * dotScale
  // Turns the galaxy at the same rate the visualizers rotate. Drawn straight onto the element, not through state, so it
  // costs no re-renders; it holds still while the kaleidoscope is off, at zero speed, or if the user asks for less motion.
  useEffect(() => {
    const group = spinRef.current
    if (!group || !on || rotationSpeed === 0 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined
    const degreesPerSecond = rotationSpeed * userConfig.rotationSpeed_RAD_PER_SEC_PER_UNIT * (180 / Math.PI)
    let last = performance.now()
    let frame = 0
    const tick = (now: number): void => {
      angleRef.current = (angleRef.current + degreesPerSecond * ((now - last) / 1000)) % 360
      last = now
      group.setAttribute('transform', `rotate(${angleRef.current.toFixed(2)})`)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [on, rotationSpeed])

  const handle = coords(-SWEEP * (count - min) / (max - min), RADIUS)

  const apply = useCallback((event: React.PointerEvent<SVGSVGElement>): void => {
    const next = countAtPointer(event, { min, max, step })
    if (next !== null && next !== count) onChange(next)
  }, [min, max, step, count, onChange])

  const handlePointerDown = useCallback((event: React.PointerEvent<SVGSVGElement>): void => {
    event.currentTarget.setPointerCapture(event.pointerId)
    apply(event)
  }, [apply])

  const handlePointerMove = useCallback((event: React.PointerEvent<SVGSVGElement>): void => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) apply(event)
  }, [apply])

  const handleKeyDown = useCallback((event: React.KeyboardEvent<SVGSVGElement>): void => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') onChange(Math.min(max, count + step))
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') onChange(Math.max(min, count - step))
    else return
    event.preventDefault()
  }, [min, max, step, count, onChange])

  return (
    <svg
      className={`kaleidoscope-dial${on ? ' kaleidoscope-dial--on' : ''}`}
      viewBox={`${-VIEW_HALF} ${-VIEW_HALF} ${VIEW_HALF * 2} ${VIEW_HALF * 2}`}
      role='slider'
      aria-label='Kaleidoscope mirrors'
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={count}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onKeyDown={handleKeyDown}
    >
      <defs>
        <filter id={`${uid}-haze`} x='-20%' y='-20%' width='140%' height='140%'>
          <feGaussianBlur stdDeviation='2.4' />
        </filter>
        <clipPath id={`${uid}-disc`}>
          <circle r={RADIUS} />
        </clipPath>
        <radialGradient id={`${uid}-core`}>
          <stop offset='0' stopColor={toCss(lighten(core, 0.7))} stopOpacity='1' />
          <stop offset='0.35' stopColor={toCss(lighten(core, 0.25))} stopOpacity='0.75' />
          <stop offset='1' stopColor={toCss(core)} stopOpacity='0' />
        </radialGradient>
      </defs>
      <circle className='kaleidoscope-dial-sky' r={RADIUS} />
      {FIELD_STARS.map(({ angle, radius }) => {
        const { x, y } = coords(angle, radius)
        return <circle key={angle} className='kaleidoscope-dial-field-star' cx={x} cy={y} r={0.7} />
      })}
      <g ref={spinRef}>
        <g clipPath={`url(#${uid}-disc)`} opacity={glow ? 1 : HAZE_OPACITY_WITHOUT_GLOW}>
          <g filter={`url(#${uid}-haze)`}>
            {arms.map(({ path }, i) => (
              <path key={i} className='kaleidoscope-dial-arm' d={path} stroke={glowColor} strokeWidth={glowWidth} />
            ))}
            {arms.map(({ clouds }, i) => clouds.map(({ x, y, radius, opacity, color }, s) => (
              <circle key={`${i}-${s}`} cx={x} cy={y} r={radius} fill={color} fillOpacity={opacity} />
            )))}
          </g>
        </g>
        {arms.map(({ stars }, i) => stars.map(({ x, y, radius, opacity, color }, s) => (
          <circle key={`${i}-${s}`} cx={x} cy={y} r={radius} fill={color} fillOpacity={opacity} />
        )))}
      </g>
      <circle className='kaleidoscope-dial-core-glow' fill={`url(#${uid}-core)`} r={(glow ? 10 : 6) + (glow ? 4 : 2) * dotScale} />
      <circle className='kaleidoscope-dial-core' r={3.2 * dotScale} fill={toCss(lighten(core, 0.85))} />
      <circle className='kaleidoscope-dial-handle-halo' cx={handle.x} cy={handle.y} r={HANDLE_RADIUS + 2} />
      <circle className='kaleidoscope-dial-handle' cx={handle.x} cy={handle.y} r={HANDLE_RADIUS} />
    </svg>
  )
})
