import React from 'react'

const ConfigSlider = ({ name, value, min, max, step, onChange }) => (
  <div>
    <h4>{name}</h4>
    <input type="range"
      name={name}
      min={min}
      max={max}
      value={value}
      step={step}
      onChange={onChange}/>
  </div>
)

export default ConfigSlider
