import React, { useState, useRef, useCallback, useEffect } from 'react'
import './CameraTouchpad.css'

const POLL_INTERVAL_MS = 33

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))

/** Main app window when config runs in a popup; otherwise `window`. */
const mainWindow = (): Window => window.opener ?? window

// The pad has the main screen's shape, so a spot on it matches a spot on the visualizer.
const padAspectRatio = (): number => mainWindow().innerWidth / mainWindow().innerHeight
const getRange = (): number => mainWindow().config?.user?.cameraBound?.value ?? 100
// Spot on the pad as a percentage of its width/height, so the pad can fill whatever width it is given.
const valToPercent = (v: number, range: number): string => `${((v / range) + 1) * 50}%`
const pixelToVal = (px: number, size: number, range: number): number => ((px / size) * 2 - 1) * range

type Pos = { x: number; y: number }

export const CameraTouchpad = (): React.ReactElement => {
  const [pos, setPos] = useState<Pos>({ x: 0, y: 0 })
  // Where the on-screen visualizer's camera has actually got to; it trails the target dot, in every mode.
  const [current, setCurrent] = useState<Pos | null>(null)
  const padRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const rafRef = useRef<number>(0)

  // Poll the camera's actual mouseX/mouseY every frame so the dot stays in sync
  // with real mouse movement on the main screen too
  useEffect(() => {
    let lastTickAt = 0
    const tick = (): void => {
      rafRef.current = requestAnimationFrame(tick)
      // Shares the main thread with the visualizers and the video texture upload, so don't poll at the display's
      // full refresh rate (240 Hz on a fast monitor); a pad dot doesn't need it.
      const now = performance.now()
      if (now - lastTickAt < POLL_INTERVAL_MS) return
      lastTickAt = now
      const steer = mainWindow().getCameraSteer?.() ?? null
      setCurrent((c) => {
        if (!steer) return c === null ? c : null
        return c && Math.abs(c.x - steer.x) < 0.05 && Math.abs(c.y - steer.y) < 0.05 ? c : steer
      })
      if (!dragging.current) {
        const range = getRange()
        if (range === 0) {
          setPos((p) => (p.x === 0 && p.y === 0 ? p : { x: 0, y: 0 }))
        } else {
          const cam = mainWindow().getVirtualCameraPosition?.()
          if (cam) {
            const nx = clamp(cam.x, -range, range)
            const ny = clamp(cam.y, -range, range)
            setPos((p) => (p.x === nx && p.y === ny ? p : { x: nx, y: ny }))
          }
        }
      }
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  const applyPos = useCallback((x: number, y: number) => {
    const range = getRange()
    const next = { x: clamp(x, -range, range), y: clamp(y, -range, range) }
    setPos(next)
    mainWindow().setVirtualCameraPosition?.(next.x, next.y)
  }, [])

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault()
    dragging.current = true

    const pad = e.currentTarget
    const rect = pad.getBoundingClientRect()
    applyPos(
      pixelToVal(clamp(e.clientX - rect.left, 0, rect.width), rect.width, getRange()),
      pixelToVal(clamp(e.clientY - rect.top, 0, rect.height), rect.height, getRange()),
    )

    const doc = pad.ownerDocument
    const onMove = (ev: MouseEvent): void => {
      if (!dragging.current || !padRef.current) return
      const r = padRef.current.getBoundingClientRect()
      applyPos(
        pixelToVal(clamp(ev.clientX - r.left, 0, r.width), r.width, getRange()),
        pixelToVal(clamp(ev.clientY - r.top, 0, r.height), r.height, getRange()),
      )
    }
    const onUp = (): void => {
      dragging.current = false
      doc.removeEventListener('mousemove', onMove)
      doc.removeEventListener('mouseup', onUp)
    }
    doc.addEventListener('mousemove', onMove)
    doc.addEventListener('mouseup', onUp)
  }, [applyPos])

  const handleDoubleClick = useCallback(() => applyPos(0, 0), [applyPos])

  const disabled = getRange() === 0

  return (
    <div className='camera-touchpad-wrapper' style={{ opacity: disabled ? 0.25 : 1, pointerEvents: disabled ? 'none' : undefined }}>
      <span className='camera-touchpad-label'>Camera Position</span>
      <div
        ref={padRef}
        className='camera-touchpad'
        style={{ aspectRatio: padAspectRatio() }}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
      >
        <div className='camera-touchpad-crosshair camera-touchpad-crosshair--h' />
        <div className='camera-touchpad-crosshair camera-touchpad-crosshair--v' />
        {current && !disabled ? (
          <div
            className='camera-touchpad-current'
            style={{ left: valToPercent(clamp(current.x, -getRange(), getRange()), getRange()), top: valToPercent(clamp(current.y, -getRange(), getRange()), getRange()) }}
          />
        ) : null}
        <img
          src='/crossheir.png'
          alt=''
          className='camera-touchpad-dot'
          style={{ left: disabled ? '50%' : valToPercent(pos.x, getRange()), top: disabled ? '50%' : valToPercent(pos.y, getRange()) }}
        />
      </div>
      <div className='camera-touchpad-values'>
        <span>X {pos.x >= 0 ? '+' : ''}{Math.round(pos.x)}</span>
        <span>Y {pos.y >= 0 ? '+' : ''}{Math.round(pos.y)}</span>
      </div>
      <span className='camera-touchpad-hint'>double-click to reset</span>
    </div>
  )
}
