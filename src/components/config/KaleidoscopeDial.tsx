import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useInfo } from './info/info'
import { ColorState } from '../../config/colorState'
import { Arm, armOf, colorShiftOffset, coords, dotScaleOf, GLOW_ALONG, lighten, paletteRgb, RADIUS, ShapeVariant, starScaleOf, starsPerArm, TAU, toCss } from './kaleidoscopeGalaxy'
import { EffectChips, EffectChipsHandle } from './EffectChips'
import { StripCanvas } from './StripCanvas'
import { StripPlacement, StripScene } from './stripPainting'
import { EffectKey, LAPS_PER_SEC_PER_UNIT, MotionEffects, RING_END_RADIUS, useGalaxyMotion } from './useGalaxyMotion'
import './KaleidoscopeDial.css'

const HANDLE_RADIUS = 7
// Room around the rim so the handle and its halo are not clipped.
const VIEW_HALF = RADIUS + HANDLE_RADIUS + 2
const VIEW_BOX = `${-VIEW_HALF} ${-VIEW_HALF} ${VIEW_HALF * 2} ${VIEW_HALF * 2}`
// Pointer closer to the center than this has no meaningful angle.
const DEAD_ZONE = 6

// The knob turns clockwise from the top (the minimum) across this much of the circle, leaving a gap at the top so the
// maximum does not wrap straight back onto the minimum.
const SWEEP = TAU * (330 / 360)

// The straight mirror modes (horizontal, vertical) show the picture as a square cut into strips, not a disc cut into wedges.
// The square fills the dial the disc fits in, and the handle rides its edge.
const SQUARE_HALF = RADIUS
const HORIZONTAL = 1
const VERTICAL = 2
// Every strip shows its own turning copy of the galaxy (a mirror of something turning has to turn the other way), so past
// this many the dial stops drawing more; they would be a pixel or two wide anyway.
const MAX_DRAWN_STRIPS = 16
// Reaches past the square's corners, so the strips are cut by their own edges and never by a disc.
const UNCLIPPED_RADIUS = VIEW_HALF * 1.5

const pct = (units: number): string => `${(units / (VIEW_HALF * 2)) * 100}%`

// How soft the haze under the galaxy is, in the dial's own units.
const HAZE_BLUR = 2.4
const HAZE_OPACITY_WITHOUT_GLOW = 0.45
// With the kaleidoscope off, the mirrored galaxy it would make is drawn over the plain one this faintly.
const GHOST_OPACITY = 0.25
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
  /** How it mirrors: 0 radial, 1 horizontal, 2 vertical (the buttons above the kaleidoscope chip). */
  mode: number
  /** Where across the dial (0 to 1) the slice every strip shows is taken from (0.5 is the exact middle). Click the dial to move it. */
  source: number
  onSourceChange: (source: number) => void
  onModeChange: (mode: number) => void
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
  /** The kaleidoscope's own switch, which leads the row of chips. */
  kaleidoscopeLabel: string
  onToggleKaleidoscope: (enabled: boolean) => void
  onChange: (count: number) => void
  /** Double-clicking the dial puts the mirror count back to its default. */
  onReset: () => void
}

/** Where the pointer is in the dial's own drawing units, with the center at 0. */
const unitsAt = (event: React.PointerEvent<HTMLDivElement>): { x: number, y: number } => {
  const rect = event.currentTarget.getBoundingClientRect()
  const scale = (VIEW_HALF * 2) / rect.width
  return { x: (event.clientX - (rect.left + rect.width / 2)) * scale, y: (event.clientY - (rect.top + rect.height / 2)) * scale }
}

/** Drag position to a count: a knob, so the pointer's angle maps evenly across the range and the handle stays under it. */
const countAtPointer = (event: React.PointerEvent<HTMLDivElement>, { min, max, step }: Pick<KaleidoscopeDialProps, 'min' | 'max' | 'step'>): number | null => {
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
  key: string
  arms: Arm[]
  opacity: number
  glowWidth: number
}

/** The faint glow under each arm is wider when there are fewer arms to share the space. */
const glowWidthFor = (armCount: number, dotScale: number): number => Math.max(1.5, Math.min(6, (TAU / armCount) * 14)) * dotScale

/**
 * The Effects at a glance, drawn as a small galaxy with a switch for each effect under it, and a knob that sets the
 * kaleidoscope's mirror count. With the kaleidoscope on it is one spiral arm per wedge, curling opposite ways on
 * alternate wedges; off, it is a plain galaxy with the mirrored one faintly over it. Whatever the kaleidoscope is
 * doing, Cyclone turns the haze and the stars opposite ways, as it does the Orbit layers, Wob Wob pulls it back on a beat, Glow swells the core,
 * Shockwave sends a ring out, Color Shift moves the colors around and Switcheroo swaps the whole galaxy between two
 * shapes, all on real beats.
 *
 * It is built as a stack of separate layers (the sky, the haze, the stars, and the ring, core and
 * handle) so that turning and pulling back are transforms the browser can do without repainting the blurred galaxy.
 */
export const KaleidoscopeDial = React.memo(({ count, min, max, step, kaleidoscope, mode, source, onSourceChange, onModeChange, palette, scale, particleSize, rotationSpeed, effects, effectLabels, onToggleEffect, kaleidoscopeLabel, onToggleKaleidoscope, onChange, onReset }: KaleidoscopeDialProps): React.ReactElement => {
  const info = useInfo()
  // Unique per dial, since the filter, clip and gradient are referenced by id.
  const uid = useId().replace(/:/g, '')
  const wedge = TAU / count
  const dotScale = dotScaleOf(scale)
  const starScale = starScaleOf(particleSize)
  const chips = useRef<EffectChipsHandle>(null)
  const stripped = mode === HORIZONTAL || mode === VERTICAL
  const motion = useGalaxyMotion({ rotationSpeed, effects, onBeat: () => chips.current?.pulse() })
  const swapped = motion.beats % 2 === 1
  const variant: ShapeVariant = effects.switcheroo && swapped ? 1 : 0
  // The radial mirror is one arm per wedge; the strip modes mirror the plain galaxy instead.
  const mirroredArms = useMemo(() => {
    if (stripped) return []
    const starCount = starsPerArm(count)
    return Array.from({ length: count }, (_, i) => armOf(i, wedge, starCount, { dotScale, starScale }, variant, true))
  }, [stripped, count, wedge, dotScale, starScale, variant])
  // Built while the kaleidoscope is off, when it is the picture and the mirrored galaxy is the ghost, and for the strips.
  const plainArms = useMemo(() => {
    if (kaleidoscope && !stripped) return []
    const plainWedge = TAU / PLAIN_ARM_COUNT
    return Array.from({ length: PLAIN_ARM_COUNT }, (_, i) => armOf(i, plainWedge, starsPerArm(PLAIN_ARM_COUNT), { dotScale, starScale }, variant, false))
  }, [kaleidoscope, stripped, dotScale, starScale, variant])
  const plainLayer: Layer = { key: 'plain', arms: plainArms, opacity: 1, glowWidth: glowWidthFor(PLAIN_ARM_COUNT, dotScale) }
  const radialLayer: Layer = { key: 'mirrored', arms: mirroredArms, opacity: kaleidoscope ? 1 : GHOST_OPACITY, glowWidth: glowWidthFor(count, dotScale) }
  // What the main panes turn. In the strip modes the mirrored picture is not in them: the strips are painted on their own
  // canvases (see StripCanvas), because the mirror image of something turning has to turn the other way.
  const layers: readonly Layer[] = stripped
    ? (kaleidoscope ? [] : [plainLayer])
    : kaleidoscope ? [radialLayer] : [plainLayer, radialLayer]
  const stripLayers: readonly Layer[] = [{ ...plainLayer, key: 'strip', opacity: kaleidoscope ? 1 : GHOST_OPACITY }]

  // The strips: the first (the top one, or the left one) is the picture, every strip after it is the one before flipped.
  const drawn = Math.min(count, MAX_DRAWN_STRIPS)
  const stripWidth = (SQUARE_HALF * 2) / drawn
  const margin = VIEW_HALF - SQUARE_HALF
  const squareInset = `inset(${pct(margin)})`
  // How far a strip's edges are from the dial's, along the strips' axis.
  const stripEdges = (k: number): { before: number, after: number } => ({
    before: margin + k * stripWidth,
    after: margin + (drawn - 1 - k) * stripWidth,
  })
  // The slice every strip shows, one strip wide around the source position. At a strip's own center that strip is the
  // picture as it is; the exact middle (the default) sits between the two middle strips when the count is even.
  const sourceStrip = Math.max(0, Math.min(drawn - 1, Math.floor(source * drawn)))
  const sourceCenter = Math.max(0.5 / drawn, Math.min(1 - 0.5 / drawn, source))
  const stripStart = (k: number): number => -SQUARE_HALF + k * stripWidth
  const sourceStart = -SQUARE_HALF + (sourceCenter - 0.5 / drawn) * SQUARE_HALF * 2
  // The strip left as it is: the one the source sits at the center of, else the first.
  const anchorStrip = Math.abs(((source * drawn) % 1) - 0.5) < 0.02 ? sourceStrip : 0
  // Moves the galaxy from where the slice is to where strip `k` is: slid across for the strips an even number of places
  // from the source's, flipped over for the odd ones.
  const stripPlacement = (k: number): { shift: number, flip: boolean } =>
    (k - anchorStrip) % 2 === 0
      ? { shift: stripStart(k) - sourceStart, flip: false }
      : { shift: stripStart(k) + sourceStart + stripWidth, flip: true }
  // Where each strip is, in the dial's drawing units from its center.
  const stripPlacements: readonly StripPlacement[] = stripped
    ? Array.from({ length: drawn }, (_, k) => {
      const { before, after } = stripEdges(k)
      const placement = stripPlacement(k)
      return mode === VERTICAL
        ? { left: -VIEW_HALF + before, top: -VIEW_HALF + margin, right: VIEW_HALF - after, bottom: VIEW_HALF - margin, ...placement }
        : { left: -VIEW_HALF + margin, top: -VIEW_HALF + before, right: VIEW_HALF - margin, bottom: VIEW_HALF - after, ...placement }
    })
    : []
  const lapsPerSecond = rotationSpeed * LAPS_PER_SEC_PER_UNIT

  // Color Shift only counts beats from the moment it was switched on, so turning it on does not change the look by itself.
  // The baseline is taken in an effect, not during render, so a render React throws away cannot leave one behind.
  const [shiftStart, setShiftStart] = useState<number | null>(null)
  useEffect(() => {
    setShiftStart(effects.colorShift ? motion.beats : null)
  }, [effects.colorShift])
  const shiftBeats = effects.colorShift ? motion.beats - (shiftStart ?? motion.beats) : 0
  const colorOf = (along: number, armIndex: number): string => toCss(paletteRgb(palette, along + colorShiftOffset(armIndex, shiftBeats)))

  // The haze of the galaxy, the glow under each arm and its clouds, blurred together.
  const hazeSvg = (idPrefix: string, layerList: readonly Layer[], clipRadius: number): React.ReactElement => (
    <svg className='kaleidoscope-dial-pane' viewBox={VIEW_BOX}>
      <defs>
        <filter id={`${idPrefix}-haze`} x='-20%' y='-20%' width='140%' height='140%'>
          <feGaussianBlur stdDeviation={HAZE_BLUR} />
        </filter>
        <clipPath id={`${idPrefix}-disc`}>
          <circle r={clipRadius} />
        </clipPath>
      </defs>
      {layerList.map(({ key: layerKey, arms, opacity: layerOpacity, glowWidth }) => (
        <g key={layerKey} className='kaleidoscope-dial-layer' style={{ opacity: layerOpacity }}>
          <g clipPath={`url(#${idPrefix}-disc)`} opacity={effects.glow ? 1 : HAZE_OPACITY_WITHOUT_GLOW}>
            <g filter={`url(#${idPrefix}-haze)`}>
              {arms.map((arm, i) => (
                <React.Fragment key={i}>
                  <path className='kaleidoscope-dial-arm' d={arm.glowInner} stroke={colorOf(GLOW_ALONG.inner, i)} strokeWidth={glowWidth} />
                  <path className='kaleidoscope-dial-arm' d={arm.glowOuter} stroke={colorOf(GLOW_ALONG.outer, i)} strokeWidth={glowWidth} />
                </React.Fragment>
              ))}
              {arms.map((arm, i) => arm.clouds.map(({ x, y, radius, opacity, along }, s) => (
                <circle key={`${i}-${s}`} cx={x} cy={y} r={radius} fill={colorOf(along, i)} fillOpacity={opacity} />
              )))}
            </g>
          </g>
        </g>
      ))}
    </svg>
  )

  // The sharp stars of the galaxy, which Cyclone turns the other way from the haze.
  const starsSvg = (layerList: readonly Layer[]): React.ReactElement => (
    <svg className='kaleidoscope-dial-pane' viewBox={VIEW_BOX}>
      {layerList.map(({ key: layerKey, arms, opacity: layerOpacity }) => (
        <g key={layerKey} className='kaleidoscope-dial-layer' style={{ opacity: layerOpacity }}>
          {arms.map((arm, i) => arm.stars.map(({ x, y, radius, opacity, along }, s) => (
            <circle key={`${i}-${s}`} cx={x} cy={y} r={radius} fill={colorOf(along, i)} fillOpacity={opacity} />
          )))}
        </g>
      ))}
    </svg>
  )

  const core = paletteRgb(palette, 0)
  // The haze of every strip is blurred as one picture, and is as bright as the glow and the galaxy's own opacity allow.
  const hazeOpacity = (effects.glow ? 1 : HAZE_OPACITY_WITHOUT_GLOW) * stripLayers.reduce((sum, { opacity }) => Math.max(sum, opacity), 0)
  const stripLayer = stripLayers[0]
  const stripScene: StripScene = {
    arms: stripLayer?.arms ?? [],
    opacity: stripLayer?.opacity ?? 1,
    glowWidth: stripLayer?.glowWidth ?? 0,
    hazeBlur: HAZE_BLUR,
    colorOf,
    coreRgb: core,
    coreRadius: (effects.glow ? 10 : 6) + (effects.glow ? 4 : 2) * dotScale,
    clipRadius: UNCLIPPED_RADIUS,
    vertical: mode === VERTICAL,
    strips: stripPlacements,
  }
  const rimHandle = coords(-SWEEP * (count - min) / (max - min), RADIUS)
  // Around the square the handle slides along its edge, on the same ray from the center.
  const edgeScale = SQUARE_HALF / Math.max(Math.abs(rimHandle.x), Math.abs(rimHandle.y))
  const handle = stripped ? { x: rimHandle.x * edgeScale, y: rimHandle.y * edgeScale } : rimHandle

  // What a drag is doing: turning the knob (the count), or, in the strip modes, moving the source strip by pressing inside the square.
  const dragging = useRef<'count' | 'source'>('count')

  const apply = useCallback((event: React.PointerEvent<HTMLDivElement>): void => {
    if (dragging.current === 'source') {
      const { x, y } = unitsAt(event)
      const at = ((mode === VERTICAL ? x : y) + SQUARE_HALF) / (SQUARE_HALF * 2)
      // It lands on a strip's own center, or on the exact middle.
      const stops = [0.5, ...Array.from({ length: drawn }, (_, k) => (k + 0.5) / drawn)]
      const nextSource = stops.reduce((best, stop) => (Math.abs(stop - at) < Math.abs(best - at) ? stop : best), 0.5)
      if (nextSource !== source) onSourceChange(nextSource)
      return
    }
    const next = countAtPointer(event, { min, max, step })
    if (next !== null && next !== count) onChange(next)
  }, [min, max, step, count, onChange, mode, drawn, source, onSourceChange])

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>): void => {
    event.currentTarget.setPointerCapture(event.pointerId)
    const { x, y } = unitsAt(event)
    const inSquare = Math.max(Math.abs(x), Math.abs(y)) < SQUARE_HALF
    // The handle sits on the square's edge and keeps its job; anywhere else in the square picks the strip.
    dragging.current = stripped && inSquare && Math.hypot(x - handle.x, y - handle.y) > HANDLE_RADIUS * 1.8 ? 'source' : 'count'
    apply(event)
  }, [apply, stripped, handle.x, handle.y])

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) apply(event)
  }, [apply])

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') onChange(Math.min(max, count + step))
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') onChange(Math.max(min, count - step))
    else return
    event.preventDefault()
  }, [min, max, step, count, onChange])

  return (
    <div className='effects-hub'>
      <div
        ref={motion.root}
        className={`kaleidoscope-dial${kaleidoscope ? ' kaleidoscope-dial--on' : ''}`}
        role='slider'
        aria-label='Kaleidoscope mirrors'
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={count}
        tabIndex={0}
        {...info('Drag to set how many mirrors. Double-click to reset.')}
        onDoubleClick={onReset}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onKeyDown={handleKeyDown}
      >
        <svg className='kaleidoscope-dial-pane' viewBox={VIEW_BOX}>
          {stripped
            ? <rect className='kaleidoscope-dial-sky' x={-SQUARE_HALF} y={-SQUARE_HALF} width={SQUARE_HALF * 2} height={SQUARE_HALF * 2} rx={3} />
            : <circle className='kaleidoscope-dial-sky' r={RADIUS} />}
          {FIELD_STARS.map(({ angle, radius }) => {
            const { x, y } = coords(angle, radius)
            return <circle key={angle} className='kaleidoscope-dial-field-star' cx={x} cy={y} r={0.7} />
          })}
        </svg>
        <div className='kaleidoscope-dial-pane' style={stripped ? { clipPath: squareInset } : undefined}>
          <div ref={motion.wob} className='kaleidoscope-dial-pane kaleidoscope-dial-moving'>
            <div ref={motion.haze} className='kaleidoscope-dial-pane kaleidoscope-dial-moving'>
              {hazeSvg(uid, layers, stripped ? UNCLIPPED_RADIUS : RADIUS)}
            </div>
            <div ref={motion.stars} className='kaleidoscope-dial-pane kaleidoscope-dial-moving'>
              {starsSvg(layers)}
            </div>
            {stripped && (
              <StripCanvas scene={stripScene} lapsPerSecond={lapsPerSecond} cyclone={effects.cyclone} hazeOpacity={hazeOpacity} viewHalf={VIEW_HALF} />
            )}
          </div>
        </div>
        <div ref={motion.ring} className='kaleidoscope-dial-pane kaleidoscope-dial-moving kaleidoscope-dial-ring-pane'>
          <svg className='kaleidoscope-dial-pane' viewBox={VIEW_BOX}>
            <circle className='kaleidoscope-dial-ring' r={RING_END_RADIUS} />
          </svg>
        </div>
        <div ref={motion.core} className='kaleidoscope-dial-pane kaleidoscope-dial-moving' style={stripped ? { opacity: 0 } : undefined}>
          <svg className='kaleidoscope-dial-pane' viewBox={VIEW_BOX}>
            <defs>
              <radialGradient id={`${uid}-core`}>
                <stop offset='0' stopColor={toCss(lighten(core, 0.7))} stopOpacity='1' />
                <stop offset='0.35' stopColor={toCss(lighten(core, 0.25))} stopOpacity='0.75' />
                <stop offset='1' stopColor={toCss(core)} stopOpacity='0' />
              </radialGradient>
            </defs>
            <circle className='kaleidoscope-dial-core-glow' fill={`url(#${uid}-core)`} r={(effects.glow ? 10 : 6) + (effects.glow ? 4 : 2) * dotScale} />
          </svg>
        </div>
        <svg className='kaleidoscope-dial-pane' viewBox={VIEW_BOX}>
          {stripped && (
            <rect
              className='kaleidoscope-dial-source'
              x={-SQUARE_HALF}
              y={-SQUARE_HALF}
              width={mode === VERTICAL ? stripWidth : SQUARE_HALF * 2}
              height={mode === VERTICAL ? SQUARE_HALF * 2 : stripWidth}
              rx={2}
              style={{ transform: `translate${mode === VERTICAL ? 'X' : 'Y'}(${sourceStart + SQUARE_HALF}px)` }}
            />
          )}
          {stripped && kaleidoscope && Array.from({ length: drawn - 1 }, (_, i) => {
            const at = -SQUARE_HALF + (i + 1) * stripWidth
            return mode === VERTICAL
              ? <line key={i} className='kaleidoscope-dial-seam' x1={at} y1={-SQUARE_HALF} x2={at} y2={SQUARE_HALF} />
              : <line key={i} className='kaleidoscope-dial-seam' x1={-SQUARE_HALF} y1={at} x2={SQUARE_HALF} y2={at} />
          })}
          <circle className='kaleidoscope-dial-handle-halo' cx={handle.x} cy={handle.y} r={HANDLE_RADIUS + 2} />
          <circle className='kaleidoscope-dial-handle' cx={handle.x} cy={handle.y} r={HANDLE_RADIUS} />
        </svg>
      </div>
      <EffectChips
        ref={chips}
        effects={effects}
        labels={effectLabels}
        onToggle={onToggleEffect}
        kaleidoscope={kaleidoscope}
        kaleidoscopeLabel={kaleidoscopeLabel}
        kaleidoscopeCount={count}
        mode={mode}
        onModeChange={onModeChange}
        onToggleKaleidoscope={onToggleKaleidoscope}
      />
    </div>
  )
})
