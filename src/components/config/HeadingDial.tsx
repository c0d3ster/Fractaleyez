import React, { useCallback, useEffect, useRef } from 'react'
import { useInfo } from './info/info'
import { Heading, TAU } from '../../config/heading'
import './HeadingDial.css'

type HeadingDialProps = {
  heading: Heading
  /** What is pointing, for the dial's accessible name (e.g. "Rotation"). */
  label: string
}

// Pointer closer to the center than this (in px) has no meaningful angle.
const DEAD_ZONE_PX = 6
const KEY_STEP = (5 * Math.PI) / 180
const SNAP_STEP = (15 * Math.PI) / 180

const toDegrees = (angle: number): number => Math.round((angle * 180) / Math.PI) % 360

/** Pointer position to a bearing (radians clockwise from straight up), or null too near the center to tell. */
const bearingAt = (event: React.PointerEvent<HTMLDivElement>): number | null => {
  const rect = event.currentTarget.getBoundingClientRect()
  const dx = event.clientX - (rect.left + rect.width / 2)
  const dy = event.clientY - (rect.top + rect.height / 2)
  if (Math.hypot(dx, dy) < DEAD_ZONE_PX) return null
  const angle = Math.atan2(dx, -dy)
  // Shift snaps to 15 degree steps, so "straight up" is easy to hit.
  return event.shiftKey ? Math.round(angle / SNAP_STEP) * SNAP_STEP : angle
}

/**
 * A small compass for something that spins: the needle shows which way it is pointing right now, and dragging it
 * (or the arrow keys) points it somewhere else, so it can be put back "up" without sliding the speed to - or + and
 * waiting. Double-click points it straight up. The needle is moved straight on the element every frame, never through
 * React, so a spinning needle does not re-render the config UI.
 */
export const HeadingDial = React.memo(({ heading, label }: HeadingDialProps): React.ReactElement => {
  const info = useInfo()
  const root = useRef<HTMLDivElement>(null)
  const needle = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const rootElement = root.current
    if (!rootElement) return undefined
    // The config can live in the pop-out window, which has its own frame clock.
    const view = rootElement.ownerDocument.defaultView ?? window
    let frame = 0
    let drawn = Number.NaN
    const draw = (): void => {
      const angle = heading.angle
      if (angle !== drawn) {
        drawn = angle
        if (needle.current) needle.current.style.transform = `rotate(${angle}rad)`
        rootElement.setAttribute('aria-valuenow', String(toDegrees(angle)))
      }
      frame = view.requestAnimationFrame(draw)
    }
    frame = view.requestAnimationFrame(draw)
    return () => view.cancelAnimationFrame(frame)
  }, [heading])

  const point = useCallback((event: React.PointerEvent<HTMLDivElement>): void => {
    const angle = bearingAt(event)
    if (angle !== null) heading.set(angle)
  }, [heading])

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>): void => {
    event.currentTarget.setPointerCapture(event.pointerId)
    point(event)
  }, [point])

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) point(event)
  }, [point])

  const handleReset = useCallback((): void => heading.set(0), [heading])

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>): void => {
    const step = event.shiftKey ? SNAP_STEP : KEY_STEP
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') heading.set(heading.angle + step)
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') heading.set(heading.angle - step)
    else if (event.key === 'Home') heading.set(0)
    else return
    event.preventDefault()
  }, [heading])

  return (
    <div
      ref={root}
      className='heading-dial'
      role='slider'
      aria-label={`${label} bearing`}
      aria-valuemin={0}
      aria-valuemax={Math.round((TAU * 180) / Math.PI)}
      aria-valuenow={toDegrees(heading.angle)}
      aria-valuetext='degrees clockwise from up'
      tabIndex={0}
      {...info(`${label} bearing: which way it is pointing now. Drag to point it somewhere else (hold Shift to snap to 15 degrees). Double-click to point it up.`)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onDoubleClick={handleReset}
      onKeyDown={handleKeyDown}
    >
      <div ref={needle} className='heading-dial-needle' />
      <div className='heading-dial-hub' />
    </div>
  )
})
