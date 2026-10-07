import React, { useCallback, useRef } from 'react'
import './PaletteRange.css'

import { connectConfig, ConfigContextValue } from './context/ConfigProvider'
import { AppConfig } from '../../config/configDefaults'
import { resolveColorState } from '../../config/colorState'
import { lutToCssGradient } from '../../config/paletteLut'
import { MIN_RANGE_GAP, rangeSpan } from '../../config/paletteRange'

type DragKind = 'start' | 'end' | 'window'

type Drag = {
  kind: DragKind
  /** For 'window': where on the strip the grab happened, so the lit part keeps its place under the pointer. */
  grabX: number
  grabStart: number
  grabEnd: number
}

type PaletteRangeProps = {
  config: AppConfig
  updateConfigItem: ConfigContextValue['updateConfigItem']
  resetConfigItem: ConfigContextValue['resetConfigItem']
}

// A press this close to a handle (as a share of the strip) grabs the handle; anywhere else on the lit part drags it whole.
const HANDLE_GRAB = 0.04
const PRECISION = 1000

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))
const tidy = (value: number): number => Math.round(value * PRECISION) / PRECISION
const scaled = (value: number): number => Math.round(value * 100)

const PaletteRangeInner = ({ config, updateConfigItem, resetConfigItem }: PaletteRangeProps): React.ReactElement => {
  const { lut, baseLut, phase, cycles, saturation } = resolveColorState(config.color)
  const start = config.color.rangeStart.value
  const end = config.color.rangeEnd.value
  const wraps = end < start

  const dragRef = useRef<Drag | null>(null)
  // The handles as of the last pointer move: a drag writes faster than React re-renders the props.
  const liveRef = useRef({ start, end })
  if (!dragRef.current) liveRef.current = { start, end }

  const commit = useCallback((nextStart: number, nextEnd: number): void => {
    liveRef.current = { start: nextStart, end: nextEnd }
    updateConfigItem('color', 'rangeStart', tidy(nextStart))
    updateConfigItem('color', 'rangeEnd', tidy(nextEnd))
  }, [updateConfigItem])

  const fractionAt = (event: React.PointerEvent<HTMLDivElement>): number => {
    const rect = event.currentTarget.getBoundingClientRect()
    return clamp((event.clientX - rect.left) / rect.width, 0, 1)
  }

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>): void => {
    const x = fractionAt(event)
    const current = liveRef.current
    const toStart = Math.abs(x - current.start)
    const toEnd = Math.abs(x - current.end)
    const inRange = current.start <= current.end ? x >= current.start && x <= current.end : false
    // The whole lit part only drags when it does not run off the end of the palette (it would have nowhere to go).
    const kind: DragKind = Math.min(toStart, toEnd) > HANDLE_GRAB && inRange ? 'window' : toStart < toEnd ? 'start' : 'end'
    dragRef.current = { kind, grabX: x, grabStart: current.start, grabEnd: current.end }
    event.currentTarget.setPointerCapture(event.pointerId)
  }, [])

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current
    if (!drag) return
    const x = fractionAt(event)
    const current = liveRef.current
    if (drag.kind === 'window') {
      const width = drag.grabEnd - drag.grabStart
      const nextStart = clamp(drag.grabStart + x - drag.grabX, 0, 1 - width)
      commit(nextStart, nextStart + width)
      return
    }
    // A handle follows the pointer and may pass the other one (the range then runs off the end and back in at the
    // start), but never sits right on it.
    const other = drag.kind === 'start' ? current.end : current.start
    const before = drag.kind === 'start' ? current.start : current.end
    const side = before >= other ? 1 : -1
    let placed = x
    if (Math.abs(placed - other) < MIN_RANGE_GAP) placed = clamp(other + side * MIN_RANGE_GAP, 0, 1)
    if (Math.abs(placed - other) < MIN_RANGE_GAP) placed = clamp(other - side * MIN_RANGE_GAP, 0, 1)
    if (drag.kind === 'start') commit(placed, current.end)
    else commit(current.start, placed)
  }, [commit])

  const handlePointerUp = useCallback((): void => {
    dragRef.current = null
  }, [])

  const handleReset = useCallback((): void => {
    resetConfigItem('color', 'rangeStart')
    resetConfigItem('color', 'rangeEnd')
  }, [resetConfigItem])

  // The parts of the bar outside the range: either side of it, or the stretch between the handles when it wraps.
  const dimmed = wraps ? [{ from: end, to: start }] : [{ from: 0, to: start }, { from: end, to: 1 }]
  // The range itself shows the palette as it is actually used (reversed, mirrored, cycled, phased and desaturated),
  // squeezed into the selection. A wrapped range is two pieces of the bar that carry on from each other.
  const span = rangeSpan(start, end)
  const lit = wraps
    ? [{ from: start, to: 1, part: [0, (1 - start) / span] }, { from: 0, to: end, part: [(1 - start) / span, 1] }]
    : [{ from: start, to: end, part: [0, 1] }]

  return (
    <div className='palette-range'>
      <div className='slider-info'>
        <h4 className='slider-name'>Range: </h4>
        <h4 className='slider-value'>{scaled(start)} - {scaled(end)}</h4>
      </div>
      <div
        className='palette-range__track'
        title='Drag a handle to crop the palette, or the lit part to slide it. Double-click for the whole palette.'
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={handleReset}
      >
        <div className='palette-range__strip' style={{ background: lutToCssGradient(baseLut, 0, 1, saturation) }}>
          {dimmed.map(({ from, to }) => (
            <div key={from} className='palette-range__dim' style={{ left: `${from * 100}%`, width: `${(to - from) * 100}%` }} />
          ))}
          {lit.map(({ from, to, part: [partFrom = 0, partTo = 1] }) => (
            <div
              key={from}
              className='palette-range__lit'
              style={{ left: `${from * 100}%`, width: `${(to - from) * 100}%`, background: lutToCssGradient(lut, phase + partFrom * cycles, (partTo - partFrom) * cycles, saturation) }}
            />
          ))}
        </div>
        <div className='palette-range__handles'>
          <div className='palette-range__handle' style={{ left: `${start * 100}%` }} />
          <div className='palette-range__handle' style={{ left: `${end * 100}%` }} />
        </div>
      </div>
    </div>
  )
}

/**
 * The palette as one slider-height bar with two handles that crop it to the range the colors are drawn from (the whole
 * palette by default). The range shows the palette as the fractal gets it, so it changes with Cycles, Phase, Reverse,
 * Mirror and Saturation as well as the handles; the end can pass the start to wrap.
 */
export const PaletteRange = connectConfig(PaletteRangeInner)
