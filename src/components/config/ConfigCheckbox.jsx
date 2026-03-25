import React from 'react'
import './Checkbox.css'

const ConfigCheckbox = React.memo(({ name, label, checked, onChange }) => (
  <div className='config-checkbox-container'>
    <input type='checkbox'
      id={name}
      name={name}
      checked={checked}
      onChange={onChange}/>
    <label htmlFor={name}>{label || name} </label>
  </div>
))

export default ConfigCheckbox
