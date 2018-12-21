import React from 'react'
import "./Slider.css"

const ConfigSlider = ({ name, value, min, max, step, onChange }) => (
  <div>
    <div className="slider-info">
      <div className="slider-value">{value}</div>
      <h4 className="slider-name">{name}</h4>
    </div>
    <input type="range"
      className="slider-input"
      name={name}
      min={min}
      max={max}
      value={value}
      step={step}
      onChange={onChange}/>
  </div>
)

export default ConfigSlider
