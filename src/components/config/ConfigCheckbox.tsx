import React from 'react'
import { useInfo } from './info/info'
import { switchGhost } from '../../utils/ghostStore'
import { useGhost } from './context/useGhost'
import './Checkbox.css'

type ConfigCheckboxProps = {
  name: string
  label?: string
  /** What the switch does, shown in the info strip while it is hovered. */
  description?: string
  /** The ghost store key (see `ghostKey`) whose value is shown as a faint tint on the switch; its real state is never touched. */
  ghostKey?: string
  checked: boolean
  onChange: React.ChangeEventHandler<HTMLInputElement>
}

export const ConfigCheckbox = React.memo(({ name, label, description, ghostKey, checked, onChange }: ConfigCheckboxProps) => {
  const info = useInfo()
  const ghost = switchGhost(useGhost(ghostKey), checked)
  return (
    <div className={`config-checkbox-container${ghost ? ` config-checkbox-container--ghost-${ghost}` : ''}`} {...info(description)}>
      <input type='checkbox'
        id={name}
        name={name}
        checked={checked}
        onChange={onChange} />
      <label htmlFor={name}>{label || name} </label>
    </div>
  )
})
