import React, { useCallback, useEffect, useRef, useState } from 'react'
import { JULIA_FAMOUS_SHAPES, JULIA_MAP_VIEW, JULIA_TOUR } from '../../visualization/julia-tour'
import './ShapePad.css'

// The pad fills its column (3:2, see ShapePad.css); the canvases use a fixed backing size that
// stays sharp when scaled to the column width.
const PAD_W = 480
const PAD_H = 320
const BACKING = 1
const MAP_MAX_ITER = 120

/** Main app window when config runs in a popup; otherwise `window`. */
const mainWindow = (): Window => window.opener ?? window

type ShapeReadout = { re: number; im: number; manual: boolean; hue: number; saturation: number; targetRe: number; targetIm: number }

const VIEW_WIDTH = JULIA_MAP_VIEW.reMax - JULIA_MAP_VIEW.reMin
const VIEW_HEIGHT = JULIA_MAP_VIEW.imMax - JULIA_MAP_VIEW.imMin

const toPixel = (re: number, im: number, width: number, height: number): [number, number] => [
  ((re - JULIA_MAP_VIEW.reMin) / VIEW_WIDTH) * width,
  ((JULIA_MAP_VIEW.imMax - im) / VIEW_HEIGHT) * height,
]

const smoothIterations = (cRe: number, cIm: number): number => {
  let zRe = 0
  let zIm = 0
  for (let n = 0; n < MAP_MAX_ITER; n++) {
    const nextRe = zRe * zRe - zIm * zIm + cRe
    zIm = 2 * zRe * zIm + cIm
    zRe = nextRe
    const magnitude = zRe * zRe + zIm * zIm
    if (magnitude > 256) return n + 1 - Math.log(Math.log(magnitude) * 0.5) / Math.LN2
  }
  return -1
}

// The escape counts only depend on the view, so they are computed once; recoloring for a new hue is cheap.
const computeIterations = (width: number, height: number): Float32Array => {
  const values = new Float32Array(width * height)
  for (let y = 0; y < height; y++) {
    const cIm = JULIA_MAP_VIEW.imMax - (y / (height - 1)) * VIEW_HEIGHT
    for (let x = 0; x < width; x++) {
      const cRe = JULIA_MAP_VIEW.reMin + (x / (width - 1)) * VIEW_WIDTH
      values[y * width + x] = smoothIterations(cRe, cIm)
    }
  }
  return values
}

const drawMandelbrot = (canvas: HTMLCanvasElement, iterations: Float32Array, hue: number, saturation: number): void => {
  const context = canvas.getContext('2d')
  if (!context) return
  const { width, height } = canvas
  const image = context.createImageData(width, height)
  const TAU = Math.PI * 2
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nu = iterations[y * width + x] ?? -1
      const offset = (y * width + x) * 4
      if (nu < 0) {
        image.data[offset] = 4
        image.data[offset + 1] = 5
        image.data[offset + 2] = 10
      } else {
        const phase = nu * 0.045 + 0.55 + hue
        const glow = 0.18 + 0.82 * Math.exp(-nu * 0.16)
        const red = (0.5 + 0.5 * Math.cos(TAU * phase)) * 255 * glow
        const green = (0.5 + 0.5 * Math.cos(TAU * (phase + 0.33))) * 255 * glow
        const blue = (0.5 + 0.5 * Math.cos(TAU * (phase + 0.67))) * 255 * glow
        // Same grayscale blend the Julia shader uses for the Saturation slider.
        const luma = 0.299 * red + 0.587 * green + 0.114 * blue
        image.data[offset] = luma + (red - luma) * saturation
        image.data[offset + 1] = luma + (green - luma) * saturation
        image.data[offset + 2] = luma + (blue - luma) * saturation
      }
      image.data[offset + 3] = 255
    }
  }
  context.putImageData(image, 0, 0)
}

const drawOverlay = (canvas: HTMLCanvasElement, shape: ShapeReadout, showPath: boolean, showMarks: boolean): void => {
  const context = canvas.getContext('2d')
  if (!context) return
  const { width, height } = canvas
  context.clearRect(0, 0, width, height)

  if (showPath) {
    context.save()
    context.setLineDash([5, 4])
    context.lineWidth = 1.5
    context.strokeStyle = 'rgba(255,255,255,0.65)'
    context.beginPath()
    JULIA_TOUR.forEach(([re, im], index) => {
      const [x, y] = toPixel(re, im, width, height)
      if (index === 0) context.moveTo(x, y)
      else context.lineTo(x, y)
    })
    context.stroke()
    context.restore()
  }

  if (showMarks) {
    context.fillStyle = '#46e6c8'
    JULIA_FAMOUS_SHAPES.forEach(({ re, im }) => {
      const [x, y] = toPixel(re, im, width, height)
      context.beginPath()
      context.arc(x, y, 3, 0, Math.PI * 2)
      context.fill()
    })
  }

  // The shape trails its destination at a Speed-based rate (the pointer's spot in manual mode, the Scale
  // slider's spot plus any Switcheroo hop on the tour), so mark where it is headed.
  if (Math.hypot(shape.targetRe - shape.re, shape.targetIm - shape.im) > 0.01) {
    const [targetX, targetY] = toPixel(shape.targetRe, shape.targetIm, width, height)
    context.lineWidth = 1.5
    context.strokeStyle = shape.manual ? 'rgba(255,93,177,0.7)' : 'rgba(255,255,255,0.6)'
    context.beginPath()
    context.arc(targetX, targetY, 5, 0, Math.PI * 2)
    context.stroke()
  }

  const [dotX, dotY] = toPixel(shape.re, shape.im, width, height)
  context.lineWidth = 2
  context.strokeStyle = shape.manual ? '#ff5db1' : '#ffffff'
  context.beginPath()
  context.arc(dotX, dotY, 8, 0, Math.PI * 2)
  context.stroke()
  context.beginPath()
  context.moveTo(dotX - 14, dotY)
  context.lineTo(dotX - 4, dotY)
  context.moveTo(dotX + 4, dotY)
  context.lineTo(dotX + 14, dotY)
  context.moveTo(dotX, dotY - 14)
  context.lineTo(dotX, dotY - 4)
  context.moveTo(dotX, dotY + 4)
  context.lineTo(dotX, dotY + 14)
  context.stroke()
  context.fillStyle = shape.manual ? '#ff5db1' : '#ffffff'
  context.beginPath()
  context.arc(dotX, dotY, 2, 0, Math.PI * 2)
  context.fill()
}

const formatCoordinate = (value: number): string => `${value < 0 ? '−' : ''}${Math.abs(value).toFixed(3)}`

export const ShapePad = (): React.ReactElement => {
  const mandelbrotRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const dragging = useRef(false)
  const showPathRef = useRef(true)
  const showMarksRef = useRef(true)
  const lastDrawnKey = useRef('')
  const iterationsRef = useRef<Float32Array | null>(null)
  const drawnHueRef = useRef(Number.NaN)
  const drawnSaturationRef = useRef(1)
  const [showPath, setShowPath] = useState(true)
  const [showMarks, setShowMarks] = useState(true)
  const [readout, setReadout] = useState<ShapeReadout>({ re: -0.75, im: 0, manual: false, hue: 0, saturation: 1, targetRe: -0.75, targetIm: 0 })

  useEffect(() => {
    const canvas = mandelbrotRef.current
    if (!canvas) return
    iterationsRef.current = computeIterations(canvas.width, canvas.height)
    drawnHueRef.current = 0
    drawMandelbrot(canvas, iterationsRef.current, 0, 1)
  }, [])

  // Poll the visualizer's current shape every frame so the dot follows the Scale slider, glides, and
  // Switcheroo hops, the same way the camera pad stays in sync with the real mouse.
  useEffect(() => {
    let frame = 0
    const tick = (): void => {
      const overlay = overlayRef.current
      const shape = mainWindow().getJuliaShape?.()
      const map = mandelbrotRef.current
      const iterations = iterationsRef.current
      // Recolor the map when the visualizer's hue moves (slow drift plus the beat color shift), in
      // 0.01 steps so the slow drift doesn't redraw every frame, or when Saturation changes.
      const colorChanged = shape
        && (Math.abs(shape.hue - drawnHueRef.current) >= 0.01 || shape.saturation !== drawnSaturationRef.current)
      if (shape && colorChanged && map && iterations) {
        drawnHueRef.current = shape.hue
        drawnSaturationRef.current = shape.saturation
        drawMandelbrot(map, iterations, shape.hue, shape.saturation)
      }
      if (overlay && shape) {
        const key = `${shape.re.toFixed(4)},${shape.im.toFixed(4)},${shape.manual},${shape.targetRe.toFixed(3)},${shape.targetIm.toFixed(3)},${showPathRef.current},${showMarksRef.current}`
        if (key !== lastDrawnKey.current) {
          lastDrawnKey.current = key
          drawOverlay(overlay, shape, showPathRef.current, showMarksRef.current)
          setReadout(shape)
        }
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  const applyPointer = useCallback((event: React.PointerEvent<HTMLCanvasElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect()
    const fractionX = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
    const fractionY = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))
    mainWindow().setJuliaShape?.(
      JULIA_MAP_VIEW.reMin + fractionX * VIEW_WIDTH,
      JULIA_MAP_VIEW.imMax - fractionY * VIEW_HEIGHT,
    )
  }, [])

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLCanvasElement>): void => {
    event.preventDefault()
    dragging.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
    applyPointer(event)
  }, [applyPointer])

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLCanvasElement>): void => {
    if (dragging.current) applyPointer(event)
  }, [applyPointer])

  const handlePointerEnd = useCallback((): void => {
    dragging.current = false
  }, [])

  const toggle = useCallback((
    setter: React.Dispatch<React.SetStateAction<boolean>>,
    ref: React.MutableRefObject<boolean>,
    checked: boolean,
  ): void => {
    ref.current = checked
    setter(checked)
    lastDrawnKey.current = ''
  }, [])

  return (
    <div className='shape-pad-wrapper'>
      <span className='shape-pad-label'>Shape {readout.manual ? '(manual)' : '(tour)'}</span>
      <div className='shape-pad'>
        <canvas
          ref={mandelbrotRef}
          className='shape-pad-canvas'
          width={PAD_W * BACKING}
          height={PAD_H * BACKING}
        />
        <canvas
          ref={overlayRef}
          className='shape-pad-canvas shape-pad-canvas--overlay'
          width={PAD_W * BACKING}
          height={PAD_H * BACKING}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          onDoubleClick={() => mainWindow().clearJuliaShape?.()}
        />
      </div>
      <div className='shape-pad-values'>
        <span>Re {formatCoordinate(readout.re)}</span>
        <span>Im {formatCoordinate(readout.im)}</span>
      </div>
      <div className='shape-pad-toggles'>
        <label>
          <input type='checkbox' checked={showPath} onChange={(e) => toggle(setShowPath, showPathRef, e.target.checked)} />
          Scale path
        </label>
        <label>
          <input type='checkbox' checked={showMarks} onChange={(e) => toggle(setShowMarks, showMarksRef, e.target.checked)} />
          Famous
        </label>
      </div>
      <div className='shape-pad-chips'>
        {JULIA_FAMOUS_SHAPES.map(({ name, re, im }) => (
          <button
            key={name}
            type='button'
            className='shape-pad-chip'
            onClick={() => mainWindow().setJuliaShape?.(re, im)}
          >
            {name}
          </button>
        ))}
      </div>
      <span className='shape-pad-hint'>drag to pick a shape, double-click to return to the Scale tour</span>
    </div>
  )
}
