import React, { useEffect, useRef, useState } from 'react'

import { labelNear, type TimeBounds } from '../recording/labelEdits'
import type { Label } from '../recording/labels'
import { panView, xToTime, zoomViewAt, type View } from '../recording/timeline'
import { drawTimeline, GUTTER_PX, TIMELINE_HEIGHT, type TimelineData } from './drawTimeline'

// How close to a label's line a press picks it up, CSS px.
const PICK_PX = 6
// One notch of the wheel (a deltaY of about 100) zooms about 20%, as the HUDs do.
const ZOOM_PER_DELTA = 0.002

type Drag = { mode: 'label'; id: number } | { mode: 'pan'; startX: number; startView: View }

type SessionTimelineProps = {
  data: TimelineData
  bounds: TimeBounds
  view: View
  onViewChange: (view: View) => void
  labels: readonly Label[]
  selectedId: number | null
  onSelect: (id: number | null) => void
  onMove: (id: number, t: number) => void
}

/**
 * The review page's plot. Wheel zooms around the pointer, dragging empty space pans, dragging a label moves it, a click selects one (or
 * clears the selection) and a double-click shows the whole session.
 */
export const SessionTimeline = ({ data, bounds, view, onViewChange, labels, selectedId, onSelect, onMove }: SessionTimelineProps): React.ReactElement => {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragRef = useRef<Drag | null>(null)
  const [width, setWidth] = useState(0)
  const [cursorMs, setCursorMs] = useState<number | null>(null)
  const [overLabel, setOverLabel] = useState(false)
  // The wheel listener is native (React's is passive, so it could not stop the page scrolling); it reads the newest view through this.
  const viewRef = useRef(view)
  viewRef.current = view

  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return undefined
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry?.contentRect.width ?? 0)))
    observer.observe(wrapper)
    return (): void => observer.disconnect()
  }, [])

  const plotWidth = Math.max(1, width - GUTTER_PX)
  const timeAt = (clientX: number): number => {
    const rect = canvasRef.current?.getBoundingClientRect()
    return xToTime(clientX - (rect?.left ?? 0) - GUTTER_PX, view, plotWidth)
  }
  const pickToleranceMs = (PICK_PX / plotWidth) * (view.endMs - view.startMs)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const handleWheel = (event: WheelEvent): void => {
      event.preventDefault()
      const current = viewRef.current
      const rect = canvas.getBoundingClientRect()
      const anchor = xToTime(event.clientX - rect.left - GUTTER_PX, current, Math.max(1, rect.width - GUTTER_PX))
      onViewChange(zoomViewAt(current, anchor, Math.exp(event.deltaY * ZOOM_PER_DELTA), bounds))
    }
    canvas.addEventListener('wheel', handleWheel, { passive: false })
    return (): void => canvas.removeEventListener('wheel', handleWheel)
  }, [bounds, onViewChange])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || width === 0) return undefined
    const frame = requestAnimationFrame(() => {
      const ratio = window.devicePixelRatio || 1
      // Only on a change: setting the size clears the canvas and its state, which a pointer move need not pay for.
      const w = Math.round(width * ratio)
      const h = Math.round(TIMELINE_HEIGHT * ratio)
      if (canvas.width !== w) canvas.width = w
      if (canvas.height !== h) canvas.height = h
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      drawTimeline(ctx, width, data, { view, labels, selectedId, cursorMs })
    })
    return (): void => cancelAnimationFrame(frame)
  }, [width, data, view, labels, selectedId, cursorMs])

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const label = labelNear(labels, timeAt(event.clientX), pickToleranceMs)
    onSelect(label?.id ?? null)
    dragRef.current = label ? { mode: 'label', id: label.id } : { mode: 'pan', startX: event.clientX, startView: view }
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    const t = timeAt(event.clientX)
    setCursorMs(t)
    const drag = dragRef.current
    if (!drag) {
      setOverLabel(labelNear(labels, t, pickToleranceMs) !== null)
      return
    }
    if (drag.mode === 'label') {
      onMove(drag.id, t)
      return
    }
    const { startView, startX } = drag
    onViewChange(panView(startView, -((event.clientX - startX) / plotWidth) * (startView.endMs - startView.startMs), bounds))
  }

  const handlePointerUp = (): void => {
    dragRef.current = null
  }

  const cursor = dragRef.current?.mode === 'pan' ? 'grabbing' : overLabel || dragRef.current?.mode === 'label' ? 'ew-resize' : 'grab'
  return (
    <div className='review-timeline' ref={wrapperRef}>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: TIMELINE_HEIGHT, cursor, touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={(): void => setCursorMs(null)}
        onDoubleClick={(): void => onViewChange(bounds)}
      />
    </div>
  )
}
