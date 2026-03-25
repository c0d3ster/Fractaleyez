import React from 'react'
import "./Slider.css"

const ConfigSlider = React.memo(({ name, label, value, min, max, step, onChange }) => (
  <div>
    <div className="slider-info">
      <h4 className="slider-name">{label || name}: </h4>
      <h4 className="slider-value">{value}</h4>
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
))

export default ConfigSlider
