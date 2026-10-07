import React, { useCallback, useRef } from 'react'
import './HueRangeRing.css'

import { connectConfig, ConfigContextValue } from './context/ConfigProvider'
import { AppConfig } from '../../config/configDefaults'
import { colorConfig } from '../../config/color.config'
import { isFullWheel } from '../../config/hueWindow'

type DragKind = 'start' | 'end' | 'arc'

type Drag = {
  kind: DragKind
  /** For 'arc': how far the grab point sits past the window's start, so the window keeps its place under the pointer. */
  grabOffset: number
}

type HueRangeRingProps = {
  config: AppConfig
  updateConfigItem: ConfigContextValue['updateConfigItem']
  resetConfigItem: ConfigContextValue['resetConfigItem']
}

const TAU = Math.PI * 2
// A press this close to a handle (in turns of the wheel) grabs the handle; anywhere else on the lit arc drags the window.
const HANDLE_GRAB_TURNS = 0.06
// Where the handles sit, as a share of the ring's width from its center (the ring spans 0.275 to 0.5 of the width).
const HANDLE_RADIUS = 0.39
const HUE_PRECISION = 1000

const fract = (value: number): number => value - Math.floor(value)
/** Shortest signed distance between two wheel positions, in turns. */
const wrapDelta = (delta: number): number => delta - Math.round(delta)
const tidy = (value: number): number => Math.round(value * HUE_PRECISION) / HUE_PRECISION
const degrees = (turns: number): number => Math.round(turns * 360) % 360

const handleStyle = (position: number): React.CSSProperties => ({
  left: `${50 + HANDLE_RADIUS * 100 * Math.sin(position * TAU)}%`,
  top: `${50 - HANDLE_RADIUS * 100 * Math.cos(position * TAU)}%`,
  background: `hsl(${Math.round(position * 360)}, 100%, 50%)`,
})

const angleAt = (event: React.PointerEvent<HTMLDivElement>): number => {
  const rect = event.currentTarget.getBoundingClientRect()
  const dx = event.clientX - (rect.left + rect.width / 2)
  const dy = event.clientY - (rect.top + rect.height / 2)
  return fract(Math.atan2(dx, -dy) / TAU)
}

const HueRangeRingInner = ({ config, updateConfigItem, resetConfigItem }: HueRangeRingProps): React.ReactElement => {
  const { hueStart, hueSpan } = config.color
  const start = hueStart.value
  const span = hueSpan.value
  const end = fract(start + span)

  const dragRef = useRef<Drag | null>(null)
  // The window as of the last pointer move: a drag writes faster than React re-renders the props.
  const liveRef = useRef({ start, span })
  if (!dragRef.current) liveRef.current = { start, span }

  const commit = useCallback((nextStart: number, nextSpan: number): void => {
    liveRef.current = { start: nextStart, span: nextSpan }
    updateConfigItem('color', 'hueStart', tidy(fract(nextStart)))
    updateConfigItem('color', 'hueSpan', tidy(nextSpan))
  }, [updateConfigItem])

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>): void => {
    const angle = angleAt(event)
    const current = liveRef.current
    const toStart = Math.abs(wrapDelta(angle - current.start))
    const toEnd = Math.abs(wrapDelta(angle - (current.start + current.span)))
    const insideArc = fract(angle - current.start) <= current.span
    // On a tie (the whole wheel, where both handles sit together) take the end, the one that can shrink the range.
    const nearest: DragKind = toStart < toEnd ? 'start' : 'end'
    const kind: DragKind = Math.min(toStart, toEnd) <= HANDLE_GRAB_TURNS || !insideArc ? nearest : 'arc'
    dragRef.current = { kind, grabOffset: wrapDelta(angle - current.start) }
    event.currentTarget.setPointerCapture(event.pointerId)
  }, [])

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current
    if (!drag) return
    const angle = angleAt(event)
    const current = liveRef.current
    const { hueSpan_MIN: minSpan, hueSpan_MAX: maxSpan } = colorConfig
    if (drag.kind === 'arc') {
      commit(angle - drag.grabOffset, current.span)
      return
    }
    const fixedEnd = current.start + current.span
    // Handles can pass through each other: the lit arc always runs clockwise from the start to the end, so crossing
    // flips the lit side to the other half of the wheel. Right on top of each other they stay a sliver or the whole
    // wheel, whichever the range was closer to.
    const together = current.span > 0.5 ? maxSpan : minSpan
    if (drag.kind === 'end') {
      const nextSpan = Math.abs(wrapDelta(angle - current.start)) < minSpan ? together : fract(angle - current.start)
      commit(current.start, nextSpan)
      return
    }
    // Dragging the start keeps the end where it is.
    if (Math.abs(wrapDelta(angle - fixedEnd)) < minSpan) {
      commit(fixedEnd - together, together)
      return
    }
    commit(angle, fract(fixedEnd - angle))
  }, [commit])

  const handlePointerUp = useCallback((): void => {
    dragRef.current = null
  }, [])

  const handleReset = useCallback((): void => {
    resetConfigItem('color', 'hueStart')
    resetConfigItem('color', 'hueSpan')
  }, [resetConfigItem])

  const full = isFullWheel(span)

  return (
    <div className='hue-ring-wrapper'>
      <div className='hue-ring-label'>Hue range</div>
      <div
        className='hue-ring'
        title='Drag a handle to set the range, or the lit arc to slide it. Double-click for the full wheel.'
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={handleReset}
      >
        <div className='hue-ring__wheel' />
        {!full && (
          <div
            className='hue-ring__dim'
            style={{ background: `conic-gradient(from ${start}turn, transparent 0turn, transparent ${span}turn, rgba(0, 0, 0, 0.75) ${span}turn, rgba(0, 0, 0, 0.75) 1turn)` }}
          />
        )}
        {!full && <div className='hue-ring__handle' style={handleStyle(start)} />}
        <div className='hue-ring__handle' style={handleStyle(full ? start : end)} />
        <div className='hue-ring__readout'>{full ? 'All' : `${degrees(start)}° to ${degrees(end)}°`}</div>
      </div>
    </div>
  )
}

/** A color wheel with two handles: the range of hues the Orbit and Fractal colors are drawn from (the whole wheel by default). */
export const HueRangeRing = connectConfig(HueRangeRingInner)
