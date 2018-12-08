import React from 'react'

import ConfigSlider from './ConfigSlider'
import ConfigCheckbox from './ConfigCheckbox';

export default class ConfigCategory extends React.Component {
  state = {
    ...this.props.data
  }

  // this helper function allows us to re render categories only when necessary using state
  // it passes along the change to the categoryWindow to update our config.js file for visual updates
  updateConfig = (event) => {
    const target = event.target;
    const item = target.name;
    const value = target.type === 'checkbox' ? target.checked : target.value;

    this.setState({[item]: value})
    this.props.onChange(this.props.name, item, value)
  }

  render() {
    return(
    <div>
      <h2>{this.props.name} Config</h2>
      {this.mapConfigItems()}
    </div>)
  }

  mapConfigItems = () => (
    Object.keys(this.props.data).map((configItem) => {
      const { type } = this.state[configItem]

      if (type == 'checkbox') {
        const { name, value } = this.state[configItem]
        return(
          <ConfigCheckbox
            name={name}
            key={name}
            checked={value}
            onChange={(e) => this.updateConfig(e)}
          />
        )
      }
      else {
        const { name, value, min, max, step } = this.state[configItem]
        return(
          <ConfigSlider
            name={name}
            key={name}
            value={value}
            min={min}
            max={max}
            step={step}
            onChange={(e) => this.updateConfig(e)}
          />
        )
      }

    })
  )
}
