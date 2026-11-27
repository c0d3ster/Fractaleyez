import React, { useCallback, useEffect, useRef, useState } from 'react'
import { getFractalFamily, type FractalFamily } from '../../visualization/fractal-families'
import './ShapePad.css'
import '../upgrade/premiumOutline.css'
import { mainWindow, Pad, PadPoint } from './Pad'
import { subscribeUiTick } from '../../utils/uiTicker'
import { colorConfig } from '../../config/color.config'
import { resolveColorState } from '../../config/colorState'
import { MAP_MAX_ITER, MIN_RECOLOR_HUE_STEP, MIN_RECOLOR_INTERVAL_MS, drawEscapeCounts } from './escapeMapColors'
import { useConfigContext } from './context/ConfigProvider'
import { useConfigSelector } from './context/useConfigSelector'
import { useUpgrade } from '../upgrade/UpgradeProvider'

// The pad fills its column (3:2, see ShapePad.css); the canvases use a fixed backing size that
// stays sharp when scaled to the column width.
const PAD_W = 480
const PAD_H = 320
const BACKING = 1
// The map is only a coarse color picture, so it is drawn at a quarter of the overlay's pixels and CSS scales it up.
const MAP_BACKING = 0.5

type ShapeReadout = { re: number; im: number; manual: boolean; hue: number; saturation: number; targetRe: number; targetIm: number }

const toPixel = ({ mapView }: FractalFamily, re: number, im: number, width: number, height: number): [number, number] => [
  ((re - mapView.reMin) / (mapView.reMax - mapView.reMin)) * width,
  ((mapView.imMax - im) / (mapView.imMax - mapView.imMin)) * height,
]

// The escape counts only depend on the family and the view, so they are computed once per family; recoloring for a new hue is cheap.
const computeIterations = ({ mapView, mapIterations }: FractalFamily, width: number, height: number): Float32Array => {
  const values = new Float32Array(width * height)
  const viewWidth = mapView.reMax - mapView.reMin
  const viewHeight = mapView.imMax - mapView.imMin
  for (let y = 0; y < height; y++) {
    const cIm = mapView.imMax - (y / (height - 1)) * viewHeight
    for (let x = 0; x < width; x++) {
      const cRe = mapView.reMin + (x / (width - 1)) * viewWidth
      values[y * width + x] = mapIterations({ re: cRe, im: cIm }, MAP_MAX_ITER)
    }
  }
  return values
}


const drawOverlay = (canvas: HTMLCanvasElement, family: FractalFamily, shape: ShapeReadout): void => {
  const context = canvas.getContext('2d')
  if (!context) return
  const { width, height } = canvas
  context.clearRect(0, 0, width, height)

  context.save()
  context.setLineDash([5, 4])
  context.lineWidth = 1.5
  context.strokeStyle = 'rgba(255,255,255,0.65)'
  context.beginPath()
  family.tour.forEach(([re, im], index) => {
    const [x, y] = toPixel(family, re, im, width, height)
    if (index === 0) context.moveTo(x, y)
    else context.lineTo(x, y)
  })
  context.stroke()
  context.restore()

  context.fillStyle = '#46e6c8'
  family.famousShapes.forEach(({ re, im }) => {
    const [x, y] = toPixel(family, re, im, width, height)
    context.beginPath()
    context.arc(x, y, 3, 0, Math.PI * 2)
    context.fill()
  })

  // The shape trails its destination at a Speed-based rate (the pointer's spot in manual mode, the Tour
  // slider's spot plus any Switcheroo hop on the tour), so mark where it is headed.
  if (Math.hypot(shape.targetRe - shape.re, shape.targetIm - shape.im) > 0.01) {
    const [targetX, targetY] = toPixel(family, shape.targetRe, shape.targetIm, width, height)
    context.lineWidth = 1.5
    context.fillStyle = '#ff5db1'
    context.strokeStyle = 'rgba(0,0,0,0.6)'
    context.beginPath()
    context.arc(targetX, targetY, 6.5, 0, Math.PI * 2)
    context.fill()
    context.stroke()
  }

  const [dotX, dotY] = toPixel(family, shape.re, shape.im, width, height)
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

const MANUAL_UPGRADE_REASON = 'Picking your own fractal shape is a premium feature. Lucid and Third Eye include it. The Tour stays free.'

const HINT = 'Drag to pick a shape. The ring is the shape now showing and the pink dot is where it is heading. The dashed line is the Tour and the teal dots are the named shapes, also under the pad. Double-click to go back to the Tour slider.'
const LOCKED_HINT = 'The shape follows the Tour slider, and the named shapes under the pad move it to their stop on the Tour. Picking your own shape (Manual) comes with Lucid and Third Eye. The ring is the shape now showing and the dashed line is the Tour.'

type ShapeModeSwitchProps = {
  manual: boolean
  manualLocked: boolean
  onTour: () => void
  onManual: () => void
}

/** Tour | Manual under the pad's title. Manual shows the premium outline when the plan doesn't include it. */
const ShapeModeSwitch = ({ manual, manualLocked, onTour, onManual }: ShapeModeSwitchProps): React.ReactElement => (
  <span className='shape-mode-switch' role='group' aria-label='Shape mode'>
    <button type='button' className={`shape-mode-option${manual ? '' : ' shape-mode-option--active'}`} aria-pressed={!manual} onClick={onTour}>
      Tour
    </button>
    <button
      type='button'
      className={`shape-mode-option${manual ? ' shape-mode-option--active' : ''}${manualLocked ? ' shape-mode-option--premium premium-outline' : ''}`}
      aria-pressed={manual}
      onClick={onManual}
    >
      {manualLocked ? '✦ ' : ''}Manual
    </button>
  </span>
)

const formatCoordinate = (value: number): string => `${value < 0 ? '−' : ''}${Math.abs(value).toFixed(3)}`

export const ShapePad = (): React.ReactElement => {
  const mandelbrotRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const lastDrawnKey = useRef('')
  const iterationsRef = useRef<Float32Array | null>(null)
  const drawnHueRef = useRef(Number.NaN)
  const drawnColorKeyRef = useRef('')
  const lastRecolorAtRef = useRef(0)
  // Picking your own shape (drag, Manual) is premium; the Tour, its named shapes and going back to it are open to all. Guests have no entitlements.
  const { entitlements, updateConfigItem } = useConfigContext()
  const family = getFractalFamily(useConfigSelector((config) => config.fractal.family.value))
  const familyRef = useRef(family)
  familyRef.current = family
  const manualLocked = entitlements?.features.customFractalPath !== true
  const { requestUpgrade } = useUpgrade()
  const [readout, setReadout] = useState<ShapeReadout>({ re: -0.75, im: 0, manual: false, hue: 0, saturation: colorConfig.saturation_DEFAULT, targetRe: -0.75, targetIm: 0 })

  // The map is the family's own parameter plane, so a new Type redraws it and the overlay.
  useEffect(() => {
    const canvas = mandelbrotRef.current
    if (!canvas) return
    iterationsRef.current = computeIterations(family, canvas.width, canvas.height)
    drawnHueRef.current = 0
    const color = resolveColorState(mainWindow().config.color)
    drawnColorKeyRef.current = color.key
    drawEscapeCounts(canvas, iterationsRef.current, 0, color)
    lastDrawnKey.current = ''
  }, [family])

  // Poll the visualizer's current shape on the shared UI tick so the dot follows the Tour slider, glides, and
  // Switcheroo hops, the same way the camera pad stays in sync with the real mouse.
  useEffect(() => {
    const tick = (now: number): void => {
      const overlay = overlayRef.current
      const shape = mainWindow().getJuliaShape?.()
      const map = mandelbrotRef.current
      const iterations = iterationsRef.current
      // Recolor the map when the visualizer's hue moves (slow drift plus the beat color shift) by a visible
      // step, or when anything in the Color config changes.
      const color = resolveColorState(mainWindow().config.color)
      const colorChanged = shape
        && (Math.abs(shape.hue - drawnHueRef.current) >= MIN_RECOLOR_HUE_STEP || color.key !== drawnColorKeyRef.current)
      if (shape && colorChanged && map && iterations && now - lastRecolorAtRef.current >= MIN_RECOLOR_INTERVAL_MS) {
        lastRecolorAtRef.current = now
        drawnHueRef.current = shape.hue
        drawnColorKeyRef.current = color.key
        drawEscapeCounts(map, iterations, shape.hue, color)
      }
      if (overlay && shape) {
        const key = `${familyRef.current.key},${shape.re.toFixed(4)},${shape.im.toFixed(4)},${shape.manual},${shape.targetRe.toFixed(3)},${shape.targetIm.toFixed(3)}`
        if (key !== lastDrawnKey.current) {
          lastDrawnKey.current = key
          drawOverlay(overlay, familyRef.current, shape)
          setReadout(shape)
        }
      }
    }
    return subscribeUiTick(tick, overlayRef.current)
  }, [])

  const handlePick = useCallback((point: PadPoint, phase: 'start' | 'move'): void => {
    if (manualLocked) {
      if (phase === 'start') requestUpgrade(MANUAL_UPGRADE_REASON)
      return
    }
    const { mapView } = family
    mainWindow().setJuliaShape?.(
      mapView.reMin + point.x * (mapView.reMax - mapView.reMin),
      mapView.imMax - point.y * (mapView.imMax - mapView.imMin),
    )
  }, [family, manualLocked, requestUpgrade])

  const handleReset = useCallback((): void => {
    mainWindow().clearJuliaShape?.()
  }, [])

  // Manual from the Tour holds the shape that is showing; the pad, a chip or a drag then moves it.
  const handleManual = useCallback((): void => {
    if (manualLocked) {
      requestUpgrade(MANUAL_UPGRADE_REASON)
      return
    }
    const shape = mainWindow().getJuliaShape?.()
    if (shape && !shape.manual) mainWindow().setJuliaShape?.(shape.re, shape.im)
  }, [manualLocked, requestUpgrade])

  // A named shape is a stop on the Tour, so picking one moves the Tour slider there and the shape stays on the Tour, where
  // Switcheroo keeps hopping along the path. Free for everyone; from Manual it hands the shape back to the Tour first.
  const pickNamedShape = useCallback((tourStop: number): void => {
    const { min, max } = mainWindow().config.fractal.tour
    mainWindow().clearJuliaShape?.()
    updateConfigItem('fractal', 'tour', min + (tourStop / (family.tour.length - 1)) * (max - min))
  }, [family, updateConfigItem])

  return (
    <Pad
      label={(
        <>
          Shape
          <ShapeModeSwitch manual={readout.manual} manualLocked={manualLocked} onTour={handleReset} onManual={handleManual} />
        </>
      )}
      onPick={handlePick}
      onReset={handleReset}
      readouts={[`Re ${formatCoordinate(readout.re)}`, `Im ${formatCoordinate(readout.im)}`]}
      hint={[manualLocked ? LOCKED_HINT : HINT, family.mapHint].filter(Boolean).join(' ')}
      footer={(
        <div className='shape-pad-chips'>
          {family.famousShapes.map(({ name, tourStop }) => (
            <button
              key={name}
              type='button'
              className='shape-pad-chip'
              onClick={() => pickNamedShape(tourStop)}
            >
              {name}
            </button>
          ))}
        </div>
      )}
    >
      <canvas
        ref={mandelbrotRef}
        className='shape-pad-canvas'
        width={PAD_W * MAP_BACKING}
        height={PAD_H * MAP_BACKING}
      />
      <canvas
        ref={overlayRef}
        className='shape-pad-canvas shape-pad-canvas--overlay'
        width={PAD_W * BACKING}
        height={PAD_H * BACKING}
      />
    </Pad>
  )
}
