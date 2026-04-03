import React from 'react'
import './Checkbox.css'

type ConfigCheckboxProps = {
  name: string
  label?: string
  checked: boolean
  onChange: React.ChangeEventHandler<HTMLInputElement>
}

export const ConfigCheckbox = React.memo(({ name, label, checked, onChange }: ConfigCheckboxProps) => (
  <div className='config-checkbox-container'>
    <input type='checkbox'
      id={name}
      name={name}
      checked={checked}
      onChange={onChange} />
    <label htmlFor={name}>{label || name} </label>
  </div>
))
