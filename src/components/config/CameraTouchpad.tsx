import React, { useState, useRef, useCallback, useEffect } from 'react'
import './CameraTouchpad.css'
import { subscribeUiTick } from '../../utils/uiTicker'
import { observeOnScreen } from '../../utils/onScreen'
import { mainWindow, Pad, PadPoint, screenAspectRatio } from './Pad'
import { snapToCenter } from './cameraPadGeometry'

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))

const getRange = (): number => mainWindow().config?.user?.sway?.value ?? 100
// Spot on the pad as a percentage of its width/height, so the pad can fill whatever width it is given.
const valToPercent = (v: number, range: number): string => `${((v / range) + 1) * 50}%`
const fractionToVal = (fraction: number, range: number): number => (fraction * 2 - 1) * range

type Pos = { x: number; y: number }

// The trailing dot moves less than this between frames when it has all but arrived, so it is not worth a repaint.
const MOVED_BY = 0.05
// Frames the pad keeps watching after the camera last moved, so a dot easing to a stop is followed all the way in.
const SETTLE_FRAMES = 12

export const CameraTouchpad = (): React.ReactElement => {
  const [pos, setPos] = useState<Pos>({ x: 0, y: 0 })
  // Where the on-screen visualizer's camera has actually got to; it trails the target dot, in every mode.
  const [current, setCurrent] = useState<Pos | null>(null)
  const dragging = useRef(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Poll the camera's actual mouseX/mouseY so the dot stays in sync with real mouse movement on the main screen too. While
  // the camera moves it is every frame, so the dots glide; once it has been still for a moment the pad stops asking for frames
  // and the shared UI tick just checks for movement, since a frame loop in the config window keeps the whole window repainting
  // on a thread it shares with the visualizer. State only changes when a value does, so the pad costs nothing repaint-wise while the camera is still.
  useEffect(() => {
    let frame = 0
    let quietFrames = 0
    let steerSeen: Pos | null = null
    let cameraSeen: Pos | null = null
    // Scrolled out of view, the pad neither follows the camera nor asks for frames; it catches up when it is back.
    let onScreen = true

    // Reads the camera once, updates what changed, and says whether anything did.
    const poll = (): boolean => {
      let moved = false
      const steer = mainWindow().getCameraSteer?.() ?? null
      const steerMoved = steer === null
        ? steerSeen !== null
        : steerSeen === null || Math.abs(steerSeen.x - steer.x) >= MOVED_BY || Math.abs(steerSeen.y - steer.y) >= MOVED_BY
      if (steerMoved) {
        steerSeen = steer
        setCurrent(steer)
        moved = true
      }
      if (dragging.current) return moved
      const range = getRange()
      const cam = range === 0 ? { x: 0, y: 0 } : mainWindow().getVirtualCameraPosition?.()
      if (!cam) return moved
      const next = { x: clamp(cam.x, -range, range), y: clamp(cam.y, -range, range) }
      if (cameraSeen && cameraSeen.x === next.x && cameraSeen.y === next.y) return moved
      cameraSeen = next
      setPos((p) => (p.x === next.x && p.y === next.y ? p : next))
      return true
    }

    const step = (): void => {
      if (!onScreen) {
        frame = 0
        return
      }
      quietFrames = poll() ? 0 : quietFrames + 1
      frame = quietFrames < SETTLE_FRAMES ? requestAnimationFrame(step) : 0
    }
    const wake = (): void => {
      if (!onScreen || frame !== 0 || !poll()) return
      quietFrames = 0
      frame = requestAnimationFrame(step)
    }

    poll()
    frame = requestAnimationFrame(step)
    const unsubscribe = subscribeUiTick(wake)
    const stopObserving = wrapperRef.current
      ? observeOnScreen(wrapperRef.current, (visible) => {
        onScreen = visible
        if (!visible) return
        quietFrames = 0
        if (frame === 0) frame = requestAnimationFrame(step)
      })
      : undefined
    return () => {
      stopObserving?.()
      unsubscribe()
      cancelAnimationFrame(frame)
    }
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
    applyPos(snapToCenter(fractionToVal(point.x, range), range), snapToCenter(fractionToVal(point.y, range), range))
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
      hint='Drag to place the camera; close to the center it snaps to exactly 0. Double-click to put it back in the center.'
      disabled={disabled}
      wrapperRef={wrapperRef}
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
