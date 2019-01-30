import React from 'react'
import classNames from 'classnames'
import './ConfigCategory.css'

import ConfigSlider from './ConfigSlider'
import ConfigCheckbox from './ConfigCheckbox'
import { connectConfig } from './context/ConfigProvider';

class ConfigCategory extends React.Component {

  // this helper function allows us to re render categories only when necessary using state
  // it passes along the change to the categoryWindow to update our config.js file for visual updates
  updateConfig = (event) => {
    const target = event.target;
    const item = target.name;
    const value = target.type === 'checkbox' ? target.checked : target.value;

    this.props.onChange(this.props.name, item, value)
  }

  render() {
    const { name, toggleOpen, isOpen } = this.props
    const categoryContentClasses = classNames('category-content', {
      'hide-content': !isOpen
    })
    return(
    <div className='category-container'>
      <h3 className='category-title' onClick={() => toggleOpen(name)}>
        {name} config
      </h3>
      <div className={categoryContentClasses}>
        {this.mapConfigItems()}
      </div>
    </div>)
  }

  mapConfigItems = () => (
    Object.keys(this.props.config[this.props.name]).map((configItem) => {
      const { type, name, value, min, max, step } = this.props.config[this.props.name][configItem]

      if (type == 'checkbox') {
        return(
          <ConfigCheckbox
            name={name}
            key={name}
            checked={value}
            onChange={this.updateConfig}
          />
        )
      }
      else {
        return(
          <ConfigSlider
            name={name}
            key={name}
            value={value}
            min={min}
            max={max}
            step={step}
            onChange={this.updateConfig}
          />
        )
      }

    })
  )
}

export default connectConfig(ConfigCategory)
