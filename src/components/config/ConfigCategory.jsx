import React from 'react'

import ConfigSlider from './ConfigSlider'
import ConfigCheckbox from './ConfigCheckbox';

export default class ConfigCategory extends React.Component {
  render() {
    return(
    <div>
      <h2>{this.props.name} Config</h2>
      {this.mapConfigItems()}
    </div>)
  }

  mapConfigItems = () => (
    Object.keys(this.props.data).map((configItem) => {
      if (this.props.data[configItem].type == 'checkbox') {
        const {name, value } = this.props.data[configItem]
        return(
          <ConfigCheckbox
            name={name}
            checked={value}
            onChange={e => this.props.onChange(e, this.props.name)}
          />
        )
      }
      else {
        const { name, value, min, max, step } = this.props.data[configItem]
        return(
          <ConfigSlider
            name={name}
            key={name}
            value={value}
            min={min}
            max={max}
            step={step}
            onChange={e => this.props.onChange(e, this.props.name)}
          />
        )
      }

    })
  )
}
