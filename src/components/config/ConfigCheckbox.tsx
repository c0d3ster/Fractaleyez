import React from 'react'
import { useInfo } from './info/info'
import './Checkbox.css'

type ConfigCheckboxProps = {
  name: string
  label?: string
  /** What the switch does, shown in the info strip while it is hovered. */
  description?: string
  checked: boolean
  onChange: React.ChangeEventHandler<HTMLInputElement>
}

export const ConfigCheckbox = React.memo(({ name, label, description, checked, onChange }: ConfigCheckboxProps) => {
  const info = useInfo()
  return (
    <div className='config-checkbox-container' {...info(description)}>
      <input type='checkbox'
        id={name}
        name={name}
        checked={checked}
        onChange={onChange} />
      <label htmlFor={name}>{label || name} </label>
    </div>
  )
})
