import React, { useState, useRef, useCallback, useEffect } from 'react'
import './CameraTouchpad.css'
import { mainWindow, Pad, PadPoint, screenAspectRatio } from './Pad'

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))

const getRange = (): number => mainWindow().config?.user?.cameraBound?.value ?? 100
// Spot on the pad as a percentage of its width/height, so the pad can fill whatever width it is given.
const valToPercent = (v: number, range: number): string => `${((v / range) + 1) * 50}%`
const fractionToVal = (fraction: number, range: number): number => (fraction * 2 - 1) * range

type Pos = { x: number; y: number }

export const CameraTouchpad = (): React.ReactElement => {
  const [pos, setPos] = useState<Pos>({ x: 0, y: 0 })
  // Where the on-screen visualizer's camera has actually got to; it trails the target dot, in every mode.
  const [current, setCurrent] = useState<Pos | null>(null)
  const dragging = useRef(false)
  const rafRef = useRef<number>(0)

  // Poll the camera's actual mouseX/mouseY every frame so the dot stays in sync
  // with real mouse movement on the main screen too. Every frame (not the shared UI tick) so the dots glide;
  // state only changes when a value does, so the pad costs nothing repaint-wise while the camera is still.
  useEffect(() => {
    const tick = (): void => {
      rafRef.current = requestAnimationFrame(tick)
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

  const handlePick = useCallback((point: PadPoint) => {
    dragging.current = true
    const range = getRange()
    applyPos(fractionToVal(point.x, range), fractionToVal(point.y, range))
  }, [applyPos])

  const handlePickEnd = useCallback(() => {
    dragging.current = false
  }, [])

  const handleReset = useCallback(() => applyPos(0, 0), [applyPos])

  const disabled = getRange() === 0

  return (
    <Pad
      label='Camera Position'
      aspectRatio={screenAspectRatio()}
      onPick={handlePick}
      onPickEnd={handlePickEnd}
      onReset={handleReset}
      readouts={[`X ${pos.x >= 0 ? '+' : ''}${Math.round(pos.x)}`, `Y ${pos.y >= 0 ? '+' : ''}${Math.round(pos.y)}`]}
      hint='double-click to reset'
      disabled={disabled}
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
    </Pad>
  )
}
