import React, { useCallback } from 'react'
import { useInfo } from './info/info'
import './Slider.css'
import { SliderZone } from '../../config/juliaScale.config'

type ConfigSliderProps = {
  name: string
  label?: string
  /** What the slider does, shown in the info strip while it is hovered. */
  description?: string
  value: number
  displayValue?: string
  // Optional color zones painted on the track, with the current zone's name shown under it.
  zones?: readonly SliderZone[]
  min: number
  max: number
  step: number
  onChange: React.ChangeEventHandler<HTMLInputElement>
  // Optional: double-click on the slider resets it (the consumer decides what "default" means).
  onReset?: React.MouseEventHandler<HTMLInputElement>
  // Optional: fires once, with the final value, when a drag/keypress ends -- lets a consumer
  // track the live value locally (for smooth dragging) while deferring any expensive/networked
  // work (e.g. persisting to the server) until the user releases the slider.
  onCommit?: (value: number) => void
}

// The native thumb travels from half its width to half its width short of the end, so a value's spot on the
// track is THUMB_REM / 2 + fraction * (100% - THUMB_REM). Stops are placed with that same formula.
const THUMB_REM = 4

const zoneGradient = (zones: readonly SliderZone[], min: number, max: number): string => {
  const position = (units: number): string =>
    `calc(${THUMB_REM / 2}rem + (100% - ${THUMB_REM}rem) * ${(units - min) / (max - min)})`
  let lower = min
  const stops = zones.map(({ upTo, color, toColor }) => {
    const stop = `${color} ${position(lower)}, ${toColor ?? color} ${position(upTo)}`
    lower = upTo
    return stop
  })
  return `linear-gradient(to right, ${stops.join(', ')})`
}

export const ConfigSlider = React.memo(({ name, label, description, value, displayValue, zones, min, max, step, onChange, onReset, onCommit }: ConfigSliderProps) => {
  const info = useInfo()
  const handleCommit = useCallback((e: React.SyntheticEvent<HTMLInputElement>): void => {
    onCommit?.(Number(e.currentTarget.value))
  }, [onCommit])

  const hint = [description, onReset ? 'Double-click to reset.' : undefined].filter(Boolean).join(' ')
  const zoneBackground = zones ? zoneGradient(zones, min, max) : undefined
  const currentZone = zones?.find((zone) => value <= zone.upTo) ?? zones?.[zones.length - 1]

  return (
    <div {...info(hint)}>
      <div className="slider-info">
        <h4 className="slider-name">{label || name}: </h4>
        <h4 className="slider-value">{displayValue ?? value}</h4>
      </div>
      <input type="range"
        className="slider-input"
        name={name}
        min={min}
        max={max}
        value={value}
        step={step}
        style={zoneBackground ? { background: zoneBackground } : undefined}
        onChange={onChange}
        onDoubleClick={onReset}
        onPointerDown={e => e.currentTarget.setPointerCapture(e.pointerId)}
        onPointerUp={handleCommit}
        onKeyUp={handleCommit} />
      {currentZone?.label && <span className='slider-zone-tag'>{currentZone.label}</span>}
    </div>
  )
})
