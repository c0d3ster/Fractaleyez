import React, { useCallback } from 'react'
import './Slider.css'

type ConfigSliderProps = {
  name: string
  label?: string
  value: number
  displayValue?: string
  min: number
  max: number
  step: number
  onChange: React.ChangeEventHandler<HTMLInputElement>
  // Optional: fires once, with the final value, when a drag/keypress ends -- lets a consumer
  // track the live value locally (for smooth dragging) while deferring any expensive/networked
  // work (e.g. persisting to the server) until the user releases the slider.
  onCommit?: (value: number) => void
}

export const ConfigSlider = React.memo(({ name, label, value, displayValue, min, max, step, onChange, onCommit }: ConfigSliderProps) => {
  const handleCommit = useCallback((e: React.SyntheticEvent<HTMLInputElement>): void => {
    onCommit?.(Number(e.currentTarget.value))
  }, [onCommit])

  return (
    <div>
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
        onChange={onChange}
        onPointerDown={e => e.currentTarget.setPointerCapture(e.pointerId)}
        onPointerUp={handleCommit}
        onKeyUp={handleCommit} />
    </div>
  )
})
