import React, { useCallback, useId, useMemo, useRef } from 'react'
import { ColorState } from '../../config/colorState'
import { Arm, armOf, colorShiftOffset, coords, CYCLONE_SPLIT, dotScaleOf, lighten, paletteRgb, RADIUS, ShapeVariant, starScaleOf, starsPerArm, TAU, toCss } from './kaleidoscopeGalaxy'
import { EffectChips, EffectChipsHandle } from './EffectChips'
import { EffectKey, MotionEffects, useGalaxyMotion } from './useGalaxyMotion'
import './KaleidoscopeDial.css'

const HANDLE_RADIUS = 7
// Room around the rim so the handle and its halo are not clipped.
const VIEW_HALF = RADIUS + HANDLE_RADIUS + 2
// Pointer closer to the center than this has no meaningful angle.
const DEAD_ZONE = 6

// The knob turns clockwise from the top (the minimum) across this much of the circle, leaving a gap at the top so the
// maximum does not wrap straight back onto the minimum.
const SWEEP = TAU * (330 / 360)

const HAZE_OPACITY_WITHOUT_GLOW = 0.45
// With the kaleidoscope off, the mirrored galaxy it would make is drawn over the plain one this faintly.
const GHOST_OPACITY = 0.2
// The plain galaxy is what the app shows with no mirroring, so it does not depend on the mirror count: a classic two-armed spiral.
const PLAIN_ARM_COUNT = 2

// A fixed scatter of background stars, so the disc reads as a patch of sky.
const FIELD_STARS = Array.from({ length: 18 }, (_, i) => ({ angle: i * 2.39996, radius: 8 + ((i * 29) % 34) }))

type KaleidoscopeDialProps = {
  count: number
  min: number
  max: number
  step: number
  /** Whether the kaleidoscope effect is on. Off, the dial shows the plain galaxy with the mirrored one faded over it. */
  kaleidoscope: boolean
  /** The live Color config: the galaxy is painted with the palette, so changing it changes the dial. */
  palette: ColorState
  /** The Scale setting: bigger scale, bigger stars and clouds. */
  scale: number
  /** The Particle size setting: sets how big the stars are (the clouds and core follow Scale only). */
  particleSize: number
  /** The Rotation setting: the galaxy turns at the rate the visualizers do, in the same direction as the sign. */
  rotationSpeed: number
  /** The Effects checkboxes; each one changes how the galaxy behaves (see useGalaxyMotion and the comments below). */
  effects: MotionEffects
  /** What each effect is called, for its switch under the galaxy. */
  effectLabels: Readonly<Record<EffectKey, string>>
  onToggleEffect: (key: EffectKey, enabled: boolean) => void
  onChange: (count: number) => void
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

type Layer = {
  key: 'plain' | 'mirrored'
  arms: Arm[]
  opacity: number
  glowWidth: number
}

/** The faint glow under each arm is wider when there are fewer arms to share the space. */
const glowWidthFor = (armCount: number, dotScale: number): number => Math.max(1.5, Math.min(6, (TAU / armCount) * 14)) * dotScale

type Zone = {
  key: 'inner' | 'outer'
  /** Where along an arm the zone's glow is colored from, and whether a star at `along` belongs to it. */
  glowAlong: number
  includes: (along: number) => boolean
}

// Cyclone turns the inside and the outside of the galaxy opposite ways, so they are drawn as two layers.
const ZONES: readonly Zone[] = [
  { key: 'inner', glowAlong: CYCLONE_SPLIT / 2, includes: (along) => along < CYCLONE_SPLIT },
  { key: 'outer', glowAlong: (1 + CYCLONE_SPLIT) / 2, includes: (along) => along >= CYCLONE_SPLIT },
]

/**
 * The Effects at a glance, drawn as a small galaxy with a switch for each effect under it, and a knob that sets the
 * kaleidoscope's mirror count. With the
 * kaleidoscope on it is one spiral arm per wedge, curling opposite ways on alternate wedges; off, it is a plain galaxy
 * with the mirrored one faintly over it. Whatever the kaleidoscope is doing, Cyclone turns the inside and outside opposite ways, Wob Wob pulls it back on a
 * beat, Glow swells the core, Shockwave sends a ring out, Color Shift moves the colors around and
 * Switcheroo swaps the whole galaxy between two shapes, all on real beats.
 */
export const KaleidoscopeDial = React.memo(({ count, min, max, step, kaleidoscope, palette, scale, particleSize, rotationSpeed, effects, effectLabels, onToggleEffect, onChange }: KaleidoscopeDialProps): React.ReactElement => {
  // Unique per dial, since the filter, clip and gradient are referenced by id.
  const uid = useId().replace(/:/g, '')
  const wedge = TAU / count
  const dotScale = dotScaleOf(scale)
  const starScale = starScaleOf(particleSize)
  const chips = useRef<EffectChipsHandle>(null)
  const motion = useGalaxyMotion({ rotationSpeed, effects, onBeat: () => chips.current?.pulse() })
  const swapped = motion.beats % 2 === 1
  const variant: ShapeVariant = effects.switcheroo && swapped ? 1 : 0
  const mirroredArms = useMemo(() => {
    const starCount = starsPerArm(count)
    return Array.from({ length: count }, (_, i) => armOf(i, wedge, starCount, { dotScale, starScale }, variant, true))
  }, [count, wedge, dotScale, starScale, variant])
  // Only built while the kaleidoscope is off, when it is the picture and the mirrored galaxy is the ghost.
  const plainArms = useMemo(() => {
    if (kaleidoscope) return []
    const plainWedge = TAU / PLAIN_ARM_COUNT
    return Array.from({ length: PLAIN_ARM_COUNT }, (_, i) => armOf(i, plainWedge, starsPerArm(PLAIN_ARM_COUNT), { dotScale, starScale }, variant, false))
  }, [kaleidoscope, dotScale, starScale, variant])
  const layers: readonly Layer[] = kaleidoscope
    ? [{ key: 'mirrored', arms: mirroredArms, opacity: 1, glowWidth: glowWidthFor(count, dotScale) }]
    : [
      { key: 'plain', arms: plainArms, opacity: 1, glowWidth: glowWidthFor(PLAIN_ARM_COUNT, dotScale) },
      { key: 'mirrored', arms: mirroredArms, opacity: GHOST_OPACITY, glowWidth: glowWidthFor(count, dotScale) },
    ]

  // Color Shift only counts beats from the moment it was switched on, so turning it on does not change the look by itself.
  const shiftStart = useRef<number | null>(null)
  if (!effects.colorShift) shiftStart.current = null
  else if (shiftStart.current === null) shiftStart.current = motion.beats
  const shiftBeats = effects.colorShift ? motion.beats - (shiftStart.current ?? motion.beats) : 0
  const colorOf = (along: number, armIndex: number): string => toCss(paletteRgb(palette, along + colorShiftOffset(armIndex, shiftBeats)))

  const core = paletteRgb(palette, 0)
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
    <div className='effects-hub'>
      <svg
        className='kaleidoscope-dial'
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
        <g ref={motion.wob}>
          {ZONES.map(({ key, glowAlong, includes }) => (
            <g key={key} ref={motion[key]}>
              {layers.map(({ key: layerKey, arms, opacity: layerOpacity, glowWidth }) => (
                <g key={layerKey} className='kaleidoscope-dial-layer' style={{ opacity: layerOpacity }}>
                  <g clipPath={`url(#${uid}-disc)`} opacity={effects.glow ? 1 : HAZE_OPACITY_WITHOUT_GLOW}>
                    <g filter={`url(#${uid}-haze)`}>
                      {arms.map((arm, i) => (
                        <path key={i} className='kaleidoscope-dial-arm' d={key === 'inner' ? arm.glowInner : arm.glowOuter} style={{ stroke: colorOf(glowAlong, i) }} strokeWidth={glowWidth} />
                      ))}
                      {arms.map((arm, i) => arm.clouds.map(({ x, y, radius, opacity, along }, s) => (
                        includes(along) ? <circle key={`${i}-${s}`} className='kaleidoscope-dial-dot' cx={x} cy={y} r={radius} fillOpacity={opacity} style={{ fill: colorOf(along, i) }} /> : null
                      )))}
                    </g>
                  </g>
                  {arms.map((arm, i) => arm.stars.map(({ x, y, radius, opacity, along }, s) => (
                    includes(along) ? <circle key={`${i}-${s}`} className='kaleidoscope-dial-dot' cx={x} cy={y} r={radius} fillOpacity={opacity} style={{ fill: colorOf(along, i) }} /> : null
                  )))}
                </g>
              ))}
            </g>
          ))}
        </g>
        <circle ref={motion.ring} className='kaleidoscope-dial-ring' r={RADIUS} strokeOpacity={0} />
        <circle ref={motion.core} className='kaleidoscope-dial-core-glow' fill={`url(#${uid}-core)`} r={(effects.glow ? 10 : 6) + (effects.glow ? 4 : 2) * dotScale} />
        <circle className='kaleidoscope-dial-handle-halo' cx={handle.x} cy={handle.y} r={HANDLE_RADIUS + 2} />
        <circle className='kaleidoscope-dial-handle' cx={handle.x} cy={handle.y} r={HANDLE_RADIUS} />
      </svg>
      <EffectChips ref={chips} effects={effects} labels={effectLabels} onToggle={onToggleEffect} />
    </div>
  )
})
