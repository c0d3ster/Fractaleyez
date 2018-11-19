import React from 'react'

import ConfigSlider from './ConfigSlider'

export default class ConfigCategory extends React.Component {
  render() {
    const { name, value, min, max, step } = this.props.data.speed
    return(
    <div>
      <h2>{this.props.name} Config</h2>
      {this.mapConfigItems()}
    </div>)
  }

  mapConfigItems = () => (
    Object.keys(this.props.data).map((configItem) => {
      const { name, value, min, max, step } = this.props.data[configItem]
      return(
      <ConfigSlider
        name={name}
        key={name}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={e => this.props.onChange(e, this.props.name)
        }
        />)
    })
  )
}
