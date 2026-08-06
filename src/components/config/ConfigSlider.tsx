import React from 'react'
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
}

export const ConfigSlider = React.memo(({ name, label, value, displayValue, min, max, step, onChange }: ConfigSliderProps) => (
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
      onChange={onChange} />
  </div>
))
