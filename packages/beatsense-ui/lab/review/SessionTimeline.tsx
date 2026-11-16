import React, { useEffect, useRef, useState } from 'react'

import { labelsNear, nextLabelAt, stepLabel, type TimeBounds } from '../recording/labelEdits'
import type { Label } from '../recording/labels'
import { panView, xToTime, zoomViewAt, type View } from '../recording/timeline'
import { drawTimeline, GUTTER_PX, TIMELINE_HEIGHT, type TimelineData } from './drawTimeline'

// How close to a label's line a press picks it up, CSS px.
const PICK_PX = 6
// How far the pointer must go before a press on a label drags it, CSS px: less is a click, which leaves the label where it is.
const DRAG_PX = 3
// One notch of the wheel (a deltaY of about 100) zooms about 20%, as the HUDs do.
const ZOOM_PER_DELTA = 0.002

type Drag =
  | {
    mode: 'label'
    id: number
    /** The label's time minus the pointer's at the press, so a drag keeps the label where it was picked up relative to the pointer. */
    offsetMs: number
    startX: number
    moved: boolean
    /** The label a click (no drag) selects instead: the next one on the same spot, when the press was on the selected one. */
    cycleTo: number | null
  }
  | { mode: 'pan'; startX: number; startView: View }

type SessionTimelineProps = {
  data: TimelineData
  bounds: TimeBounds
  view: View
  onViewChange: (view: View) => void
  /** Sorted by time. */
  labels: readonly Label[]
  selectedId: number | null
  onSelect: (id: number | null) => void
  onMove: (id: number, t: number) => void
  /** Text after a label's tag (its pass number, on a song of several passes). */
  tagSuffix?: (id: number) => string
}

/**
 * The review page's plot. Wheel zooms around the pointer, dragging empty space pans, dragging a label moves it, a click selects one (or
 * clears the selection; again on the selected one, the next label on the same spot) and a double-click shows the whole session. Focused,
 * [ and ] select the label before or after the selected one.
 */
export const SessionTimeline = ({ data, bounds, view, onViewChange, labels, selectedId, onSelect, onMove, tagSuffix }: SessionTimelineProps): React.ReactElement => {
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
      drawTimeline(ctx, width, data, { view, labels, selectedId, cursorMs, tagSuffix })
    })
    return (): void => cancelAnimationFrame(frame)
  }, [width, data, view, labels, selectedId, cursorMs, tagSuffix])

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const t = timeAt(event.clientX)
    const near = labelsNear(labels, t, pickToleranceMs)
    // The selected label stays the one held when it is under the pointer, so it can be dragged though others share its spot.
    const held = near.find(({ id }) => id === selectedId) ?? near[0] ?? null
    if (!held) {
      onSelect(null)
      dragRef.current = { mode: 'pan', startX: event.clientX, startView: view }
      return
    }
    onSelect(held.id)
    const next = held.id === selectedId ? nextLabelAt(labels, t, pickToleranceMs, selectedId) : null
    dragRef.current = { mode: 'label', id: held.id, offsetMs: held.t - t, startX: event.clientX, moved: false, cycleTo: next && next.id !== held.id ? next.id : null }
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    const t = timeAt(event.clientX)
    setCursorMs(t)
    const drag = dragRef.current
    if (!drag) {
      setOverLabel(labelsNear(labels, t, pickToleranceMs).length > 0)
      return
    }
    if (drag.mode === 'label') {
      if (!drag.moved && Math.abs(event.clientX - drag.startX) < DRAG_PX) return
      drag.moved = true
      onMove(drag.id, t + drag.offsetMs)
      return
    }
    const { startView, startX } = drag
    onViewChange(panView(startView, -((event.clientX - startX) / plotWidth) * (startView.endMs - startView.startMs), bounds))
  }

  const handlePointerUp = (): void => {
    const drag = dragRef.current
    dragRef.current = null
    if (drag?.mode === 'label' && !drag.moved && drag.cycleTo !== null) onSelect(drag.cycleTo)
  }

  const handlePointerCancel = (): void => {
    dragRef.current = null
  }

  // [ and ] select the label before and after the selected one (from the view's edge with none selected), panning to it if it is out of view.
  const handleKeyDown = (event: React.KeyboardEvent<HTMLCanvasElement>): void => {
    if ((event.key !== '[' && event.key !== ']') || event.ctrlKey || event.metaKey || event.altKey) return
    event.preventDefault()
    const step = event.key === ']' ? 1 : -1
    const label = stepLabel(labels, selectedId, step, step > 0 ? view.startMs : view.endMs)
    if (!label) return
    onSelect(label.id)
    if (label.t < view.startMs || label.t > view.endMs) onViewChange(panView(view, label.t - (view.startMs + view.endMs) / 2, bounds))
  }

  const cursor = dragRef.current?.mode === 'pan' ? 'grabbing' : overLabel || dragRef.current?.mode === 'label' ? 'ew-resize' : 'grab'
  return (
    <div className='review-timeline' ref={wrapperRef}>
      <canvas
        ref={canvasRef}
        tabIndex={0}
        aria-label='Session timeline. [ and ] select the previous and next label, the arrows nudge it, Delete removes it.'
        style={{ width: '100%', height: TIMELINE_HEIGHT, cursor, touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onPointerLeave={(): void => setCursorMs(null)}
        onDoubleClick={(): void => onViewChange(bounds)}
        onKeyDown={handleKeyDown}
      />
    </div>
  )
}
