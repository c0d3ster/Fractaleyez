
import React from 'react'

const ConfigCheckbox = ({ name, checked, onChange }) => (
  <div>
    <h4>{name}</h4>
    <input type='checkbox'
      name={name}
      checked={checked}
      onChange={onChange}/>
  </div>
)

export default ConfigCheckbox
