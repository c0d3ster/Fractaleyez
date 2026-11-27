import React, { useCallback, useEffect, useMemo, useRef } from 'react'

import { FRACTAL_FAMILIES, fractalTypesEnabled, type FractalFamily } from '../../visualization/fractal-families'
import { resolveColorState } from '../../config/colorState'
import { subscribeUiTick } from '../../utils/uiTicker'
import { useConfigContext } from './context/ConfigProvider'
import { useConfigSelector } from './context/useConfigSelector'
import { useInfo } from './info/info'
import { MAP_MAX_ITER, MIN_RECOLOR_HUE_STEP, MIN_RECOLOR_INTERVAL_MS, drawEscapeCounts } from './escapeMapColors'
import { mainWindow } from './Pad'
import './FractalTypePicker.css'

const THUMB_W = 90
const THUMB_H = 60
const THUMB_MAX_ITER = 60

/**
 * Escape counts for a small picture of the family: its Julia set at the middle of its tour (where the Tour slider starts), framed like
 * the widest Scale. Computed once per thumbnail; the colors are painted from them like the shape pad's map, so they follow the palette.
 */
const thumbnailCounts = (family: FractalFamily): Float32Array => {
  const counts = new Float32Array(THUMB_W * THUMB_H)
  const [cRe, cIm] = family.tour[Math.floor(family.tour.length / 2)] ?? [0, 0]
  const radius = family.wholeSetRadius
  const orbit: [number, number] = [0, 0]
  for (let y = 0; y < THUMB_H; y++) {
    for (let x = 0; x < THUMB_W; x++) {
      orbit[0] = family.wholeSetCenter.re + ((x / (THUMB_W - 1)) * 2 - 1) * radius * (THUMB_W / THUMB_H)
      orbit[1] = family.wholeSetCenter.im + (1 - (y / (THUMB_H - 1)) * 2) * radius
      let escapedAt = -1
      for (let n = 0; n < THUMB_MAX_ITER; n++) {
        family.step(orbit, cRe, cIm)
        if (family.escaped(orbit[0], orbit[1])) {
          escapedAt = Math.min(n, MAP_MAX_ITER)
          break
        }
      }
      counts[y * THUMB_W + x] = escapedAt
    }
  }
  return counts
}

type TypeButtonProps = {
  family: FractalFamily
  index: number
  selected: boolean
  onPick: (index: number) => void
}

const TypeButton = ({ family, index, selected, onPick }: TypeButtonProps): React.ReactElement => {
  const info = useInfo()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const counts = useMemo(() => thumbnailCounts(family), [family])

  // Repaint when the visualizer's hue moves a visible step or the Color config changes, rate limited like the shape pad.
  useEffect(() => {
    let drawnHue = Number.NaN
    let drawnKey = ''
    let lastAt = Number.NEGATIVE_INFINITY
    const tick = (now: number): void => {
      const canvas = canvasRef.current
      if (!canvas) return
      const hue = mainWindow().getJuliaShape?.()?.hue ?? 0
      const color = resolveColorState(mainWindow().config.color)
      const changed = color.key !== drawnKey || !(Math.abs(hue - drawnHue) < MIN_RECOLOR_HUE_STEP)
      if (!changed || now - lastAt < MIN_RECOLOR_INTERVAL_MS) return
      lastAt = now
      drawnHue = hue
      drawnKey = color.key
      drawEscapeCounts(canvas, counts, hue, color)
    }
    tick(performance.now())
    return subscribeUiTick(tick, canvasRef.current)
  }, [counts])

  return (
    <button
      type='button'
      className={`fractal-type${selected ? ' fractal-type--active' : ''}`}
      aria-pressed={selected}
      {...info(`${family.label} · ${family.mathName}, ${family.formula}. ${family.description}`)}
      onClick={() => onPick(index)}
    >
      <canvas ref={canvasRef} className='fractal-type__thumb' width={THUMB_W} height={THUMB_H} />
      <span className='fractal-type__label'>{family.label}</span>
    </button>
  )
}

type FractalTypePickerProps = {
  /** The expanded config window: three per row, so the pictures are big enough to read. */
  expanded?: boolean
}

/**
 * The fractal layer's Type: one button per family, each with a little picture of it, above the Shape pad. Hovering or picking one shows
 * what it is in the info strip (a tooltip in the sidebar, which has none): the friendly name, then the math name and the map for anyone
 * who knows it, then a plain description.
 */
const FractalTypePickerInner = ({ expanded = false }: FractalTypePickerProps): React.ReactElement => {
  const { updateConfigItem } = useConfigContext()
  const current = Math.round(useConfigSelector((config) => config.fractal.family.value))
  const handlePick = useCallback((index: number): void => updateConfigItem('fractal', 'family', index), [updateConfigItem])
  return (
    <div className={`fractal-types${expanded ? ' fractal-types--expanded' : ''}`}>
      <div className='fractal-types__row' role='group' aria-label='Fractal type'>
        {FRACTAL_FAMILIES.map((each, index) => (
          <TypeButton key={each.key} family={each} index={index} selected={index === current} onPick={handlePick} />
        ))}
      </div>
    </div>
  )
}

/** The Type picker, shown only once the Types are released (the `fractalTypes` feature flag). */
export const FractalTypePicker = (props: FractalTypePickerProps): React.ReactElement | null =>
  fractalTypesEnabled() ? <FractalTypePickerInner {...props} /> : null
