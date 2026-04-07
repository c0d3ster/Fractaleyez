import React, { useState, useRef, useCallback, useEffect } from 'react'
import './CameraTouchpad.css'

const PAD_W = 160
const RANGE = 500

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))
const padH = (): number => Math.round(PAD_W / (window.innerWidth / window.innerHeight))
const valToPixelX = (v: number, w: number): number => ((v / RANGE) + 1) * (w / 2)
const valToPixelY = (v: number, h: number): number => ((v / RANGE) + 1) * (h / 2)
const pixelToValX = (px: number, w: number): number => ((px / w) * 2 - 1) * RANGE
const pixelToValY = (py: number, h: number): number => ((py / h) * 2 - 1) * RANGE

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
        const cam = window.getVirtualCameraPosition?.()
        if (cam) setPos({ x: clamp(cam.x, -RANGE, RANGE), y: clamp(cam.y, -RANGE, RANGE) })
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  const applyPos = useCallback((x: number, y: number) => {
    const next = { x: clamp(x, -RANGE, RANGE), y: clamp(y, -RANGE, RANGE) }
    setPos(next)
    window.setVirtualCameraPosition?.(next.x, next.y)
  }, [])

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault()
    dragging.current = true

    const pad = e.currentTarget
    const ph = padH()
    const rect = pad.getBoundingClientRect()
    applyPos(
      pixelToValX(clamp(e.clientX - rect.left, 0, PAD_W), PAD_W),
      pixelToValY(clamp(e.clientY - rect.top, 0, ph), ph),
    )

    const doc = pad.ownerDocument
    const onMove = (ev: MouseEvent): void => {
      if (!dragging.current || !padRef.current) return
      const r = padRef.current.getBoundingClientRect()
      const ph2 = padH()
      applyPos(
        pixelToValX(clamp(ev.clientX - r.left, 0, PAD_W), PAD_W),
        pixelToValY(clamp(ev.clientY - r.top, 0, ph2), ph2),
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
          style={{ left: valToPixelX(pos.x, PAD_W), top: valToPixelY(pos.y, h) }}
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
