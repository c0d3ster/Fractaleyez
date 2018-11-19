import React from 'react'

export default class ConfigItem extends React.PureComponent {
  render() {
    const { name, value, min, max, step, onChange } = this.props
    return(
    <div>
      <h4>{name}</h4>
      <input type="range"
        name={name.toLowerCase()}
        min={min}
        max={max}
        defaultValue={value}
        step={step}
        onChange={onChange}/>
    </div>)
  }
}
