import React, { useCallback, useRef } from 'react'
import './Pad.css'

/** Main app window when config runs in a popup; otherwise `window`. */
export const mainWindow = (): Window => window.opener ?? window

/**
 * The main screen's shape, so a spot on a pad matches a spot on the visualizer. Never taller than square: a portrait
 * window (a phone) would otherwise stretch the pad far down the sidebar.
 */
export const screenAspectRatio = (): number => Math.max(1, mainWindow().innerWidth / mainWindow().innerHeight)

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value))

/** A spot on the pad as 0..1 fractions of its width and height (y down), plus the pad's size in pixels. */
export type PadPoint = { x: number, y: number, width: number, height: number }

type PadProps = {
  label: string
  /** Width over height of the drawing surface; 3:2 unless given. */
  aspectRatio?: number
  /** A press (`start`) or a drag step (`move`), clamped to the pad. */
  onPick: (point: PadPoint, phase: 'start' | 'move') => void
  /** The pointer was released or cancelled. */
  onPickEnd?: () => void
  /** Double-click, with the spot it landed on. */
  onReset?: (point: PadPoint) => void
  /** Short values under the pad, such as `X +10`. */
  readouts?: readonly string[]
  /** How to use the pad, shown as a tooltip on its title so it takes no room under the pad. */
  hint?: string
  /** Dims the pad and ignores the pointer. */
  disabled?: boolean
  /** Drawn inside the surface (canvases, dots, guides); it should not take pointer events itself. */
  children?: React.ReactNode
  /** Drawn under the readouts, outside the surface (chips). */
  footer?: React.ReactNode
  /** The pad's outer element, for a pad that needs to know when it is on screen. */
  wrapperRef?: React.Ref<HTMLDivElement>
}

/**
 * The frame the config pads share: a labelled, screen-shaped surface that turns a press or drag into 0..1 positions
 * (pointer capture, so a drag keeps going outside the pad and works on touch), plus the readout and hint rows. What is
 * drawn on it and what a pick means is up to each pad. The hint on how to use it is the title's tooltip.
 */
export const Pad = ({ label, aspectRatio = 3 / 2, onPick, onPickEnd, onReset, readouts, hint, disabled = false, children, footer, wrapperRef }: PadProps): React.ReactElement => {
  const dragging = useRef(false)

  const pointOf = useCallback((event: React.MouseEvent<HTMLDivElement>): PadPoint => {
    const rect = event.currentTarget.getBoundingClientRect()
    return {
      x: clamp01((event.clientX - rect.left) / rect.width),
      y: clamp01((event.clientY - rect.top) / rect.height),
      width: rect.width,
      height: rect.height,
    }
  }, [])

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return
    event.preventDefault()
    dragging.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
    onPick(pointOf(event), 'start')
  }, [onPick, pointOf])

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>): void => {
    if (dragging.current) onPick(pointOf(event), 'move')
  }, [onPick, pointOf])

  const handlePointerEnd = useCallback((): void => {
    if (!dragging.current) return
    dragging.current = false
    onPickEnd?.()
  }, [onPickEnd])

  const handleDoubleClick = useCallback((event: React.MouseEvent<HTMLDivElement>): void => {
    onReset?.(pointOf(event))
  }, [onReset, pointOf])

  return (
    <div className='pad-wrapper' ref={wrapperRef} style={{ opacity: disabled ? 0.25 : 1, pointerEvents: disabled ? 'none' : undefined }}>
      <span className='pad-label' title={hint}>{label}</span>
      <div
        className='pad'
        style={{ aspectRatio }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onDoubleClick={handleDoubleClick}
      >
        {children}
      </div>
      {readouts?.length ? <div className='pad-values'>{readouts.map((text) => <span key={text.split(' ')[0]}>{text}</span>)}</div> : null}
      {footer}
    </div>
  )
}
