import React from 'react'

import ConfigSlider from './ConfigSlider'

export default class ConfigCategory extends React.PureComponent {
  render() {
    const { name, value, min, max, step } = this.props.data.speed
    return(
    <div>
      <h2>{this.props.name} Config</h2>
      <ConfigSlider
        name={name}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={e => this.props.onChange(this.props.name.toLowerCase(), e)}/>
    </div>)
  }
}
