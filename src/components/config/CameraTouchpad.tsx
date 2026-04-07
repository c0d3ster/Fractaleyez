import React, { useState, useRef, useCallback, useEffect } from 'react'
import './CameraTouchpad.css'

const PAD_W = 180

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))

/** Main app window when config runs in a popup; otherwise `window`. */
const mainWindow = (): Window => window.opener ?? window

const padH = (): number => Math.round(PAD_W / (mainWindow().innerWidth / mainWindow().innerHeight))
const getRange = (): number => mainWindow().config?.user?.cameraBound?.value ?? 100
const valToPixelX = (v: number, w: number, range: number): number => ((v / range) + 1) * (w / 2)
const valToPixelY = (v: number, h: number, range: number): number => ((v / range) + 1) * (h / 2)
const pixelToValX = (px: number, w: number, range: number): number => ((px / w) * 2 - 1) * range
const pixelToValY = (py: number, h: number, range: number): number => ((py / h) * 2 - 1) * range

type Pos = { x: number; y: number }

export const CameraTouchpad = (): React.ReactElement => {
  const [pos, setPos] = useState<Pos>({ x: 0, y: 0 })
  const padRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const rafRef = useRef<number>(0)
  const h = padH()

  // Poll the camera's actual mouseX/mouseY every frame so the dot stays in sync
  // with real mouse movement on the main screen too
  useEffect(() => {
    const tick = (): void => {
      if (!dragging.current) {
        const cam = mainWindow().getVirtualCameraPosition?.()
        const range = getRange()
        if (cam) setPos({ x: clamp(cam.x, -range, range), y: clamp(cam.y, -range, range) })
      }
      rafRef.current = requestAnimationFrame(tick)
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
    const ph = padH()
    const rect = pad.getBoundingClientRect()
    applyPos(
      pixelToValX(clamp(e.clientX - rect.left, 0, PAD_W), PAD_W, getRange()),
      pixelToValY(clamp(e.clientY - rect.top, 0, ph), ph, getRange()),
    )

    const doc = pad.ownerDocument
    const onMove = (ev: MouseEvent): void => {
      if (!dragging.current || !padRef.current) return
      const r = padRef.current.getBoundingClientRect()
      const ph2 = padH()
      applyPos(
        pixelToValX(clamp(ev.clientX - r.left, 0, PAD_W), PAD_W, getRange()),
        pixelToValY(clamp(ev.clientY - r.top, 0, ph2), ph2, getRange()),
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

  return (
    <div className='camera-touchpad-wrapper'>
      <span className='camera-touchpad-label'>Camera Position</span>
      <div
        ref={padRef}
        className='camera-touchpad'
        style={{ width: PAD_W, height: h }}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
      >
        <div className='camera-touchpad-crosshair camera-touchpad-crosshair--h' />
        <div className='camera-touchpad-crosshair camera-touchpad-crosshair--v' />
        <div
          className='camera-touchpad-dot'
          style={{ left: valToPixelX(pos.x, PAD_W, getRange()), top: valToPixelY(pos.y, h, getRange()) }}
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
