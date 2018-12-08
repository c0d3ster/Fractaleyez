
import React from 'react'

export default class ConfigCheckbox extends React.PureComponent {

  render() {
    const { name, checked, onChange } = this.props
    return(
    <div>
      <h4>{name}</h4>
      <input type='checkbox'
        name={name}
        checked={checked}
        onChange={onChange}/>
    </div>)
  }
}
