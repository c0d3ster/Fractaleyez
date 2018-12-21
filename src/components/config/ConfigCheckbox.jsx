
import React from 'react'
import './Checkbox.css'

const ConfigCheckbox = ({ name, checked, onChange }) => (
  <div className='config-checkbox-container'>
    <input type='checkbox'
      id={name}
      name={name}
      checked={checked}
      onChange={onChange}/>
    <label htmlFor={name}>{name} </label>
  </div>
)

export default ConfigCheckbox
