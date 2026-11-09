import React, { useCallback, useEffect, useRef } from 'react'
import { useInfo } from './info/info'
import { Heading } from '../../config/heading'
import {
  angleToSpeed,
  ARC_RADIUS,
  arcPath,
  formatSpeed,
  HALF,
  pointAt,
  regionAt,
  RING_RADIUS,
  speedToAngle,
  SpinRange,
  SWEEP,
  VIEW,
} from './spinDialGeometry'
import './SpinDial.css'

type SpinDialProps = SpinRange & {
  label: string
  /** What the setting does, shown in the info strip while it is hovered. */
  description?: string
  /** The speed this dial sets: negative turns the other way, 0 is still. */
  value: number
  /** Which way the thing is pointing now, drawn as the dot on the ring and set by dragging it. */
  heading: Heading
  onChange: (value: number) => void
  /** Puts the speed back to its default. */
  onReset: () => void
}

const SNAP_STEP = (15 * Math.PI) / 180
const DEFAULT_KEY_STEPS = 1
const SHIFT_KEY_STEPS = 10
// A press this close to the center has no meaningful angle.
const DEAD_ZONE = 4

type Grab = 'ring' | 'speed'

/** Where the pointer is in the dial's own units, with the center at 0 and y down. */
const unitsAt = (event: React.PointerEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>): { x: number, y: number } => {
  const rect = event.currentTarget.getBoundingClientRect()
  const scale = VIEW / rect.width
  return { x: (event.clientX - (rect.left + rect.width / 2)) * scale, y: (event.clientY - (rect.top + rect.height / 2)) * scale }
}

/**
 * A control for something that spins, replacing the plain slider. Two knobs in one circle.
 *
 * The dot on the outer ring is the bearing, which way it is pointing right now. It circles at the speed's rate; drag
 * it to point the thing somewhere else (Shift snaps to 15 degrees, double-click the ring points it up).
 *
 * The arc inside is the speed gauge, like a rev counter that starts at the top: 0 is straight up, clockwise is faster
 * one way and counterclockwise the other. Drag across it to set the speed (double-click it to reset).
 *
 * The value is the number in the middle. Arrow keys step the speed.
 *
 * The bearing dot is moved straight on its element every frame, never through React, so it can spin without
 * re-rendering the config UI.
 */
export const SpinDial = React.memo(({ label, description, value, min, max, step, heading, onChange, onReset }: SpinDialProps): React.ReactElement => {
  const info = useInfo()
  const root = useRef<HTMLDivElement>(null)
  const dot = useRef<SVGGElement>(null)
  const grab = useRef<Grab>('speed')
  const range: SpinRange = { min, max, step }

  useEffect(() => {
    const rootElement = root.current
    if (!rootElement) return undefined
    // The config can live in the pop-out window, which has its own frame clock.
    const view = rootElement.ownerDocument.defaultView ?? window
    let frame = 0
    let drawn = Number.NaN
    const draw = (): void => {
      const bearing = heading.angle
      if (bearing !== drawn) {
        drawn = bearing
        dot.current?.setAttribute('transform', `rotate(${(bearing * 180) / Math.PI})`)
      }
      frame = view.requestAnimationFrame(draw)
    }
    frame = view.requestAnimationFrame(draw)
    return () => view.cancelAnimationFrame(frame)
  }, [heading])

  const apply = useCallback((event: React.PointerEvent<HTMLDivElement>): void => {
    const { x, y } = unitsAt(event)
    if (Math.hypot(x, y) < DEAD_ZONE) return
    const pointed = Math.atan2(x, -y)
    if (grab.current === 'ring') {
      // Shift snaps to 15 degree steps, so "straight up" is easy to hit.
      heading.set(event.shiftKey ? Math.round(pointed / SNAP_STEP) * SNAP_STEP : pointed)
      return
    }
    const next = angleToSpeed(pointed, { min, max, step })
    if (next !== value) onChange(next)
  }, [heading, min, max, step, value, onChange])

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>): void => {
    const { x, y } = unitsAt(event)
    const region = regionAt(Math.hypot(x, y))
    // The middle is only for reading and for the double-click reset.
    if (region === 'hub') return
    grab.current = region
    event.currentTarget.setPointerCapture(event.pointerId)
    apply(event)
  }, [apply])

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) apply(event)
  }, [apply])

  const handleDoubleClick = useCallback((event: React.MouseEvent<HTMLDivElement>): void => {
    const { x, y } = unitsAt(event)
    if (regionAt(Math.hypot(x, y)) === 'ring') heading.set(0)
    else onReset()
  }, [heading, onReset])

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>): void => {
    const jump = step * (event.shiftKey ? SHIFT_KEY_STEPS : DEFAULT_KEY_STEPS)
    const move = (to: number): void => onChange(Math.max(min, Math.min(max, Number(to.toFixed(6)))))
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') move(value + jump)
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') move(value - jump)
    else if (event.key === 'Home') onReset()
    else return
    event.preventDefault()
  }, [min, max, step, value, onChange, onReset])

  const angle = speedToAngle(value, range)
  const handle = pointAt(ARC_RADIUS, angle)
  const topMark = pointAt(ARC_RADIUS, 0)
  const hint = [description, 'Drag the dot on the ring to point it somewhere else, or across the arc to set the speed.', 'Double-click the ring to point it up, or the arc to reset the speed.'].filter(Boolean).join('\n')

  return (
    <div className='spin-dial-wrapper' {...info(hint)}>
      <h4 className='slider-name'>{label}</h4>
      <div
        ref={root}
        className='spin-dial'
        role='slider'
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onDoubleClick={handleDoubleClick}
        onKeyDown={handleKeyDown}
      >
        <svg className='spin-dial-pane' viewBox={`${-HALF} ${-HALF} ${VIEW} ${VIEW}`}>
          <circle className='spin-dial-face' r={HALF - 1} />
          <circle className='spin-dial-ring' r={RING_RADIUS} />
          <path className='spin-dial-track' d={arcPath(ARC_RADIUS, -SWEEP, SWEEP)} />
          <path className='spin-dial-fill' d={arcPath(ARC_RADIUS, 0, angle)} />
          <line className='spin-dial-zero' x1={topMark.x} y1={topMark.y - 5} x2={topMark.x} y2={topMark.y + 5} />
          <circle className='spin-dial-handle' cx={handle.x} cy={handle.y} r={5} />
          <g ref={dot}>
            <circle className='spin-dial-bearing' cx={0} cy={-RING_RADIUS} r={5.5} />
          </g>
          <text className='spin-dial-value' x={0} y={1} textAnchor='middle' dominantBaseline='central'>{formatSpeed(value)}</text>
        </svg>
      </div>
    </div>
  )
})
