import React, { useCallback } from 'react'
import classNames from 'classnames'
import './ConfigCategory.css'

import ConfigSlider from './ConfigSlider'
import ConfigCheckbox from './ConfigCheckbox'
import { connectConfig } from './context/ConfigProvider'

const ConfigCategory = React.memo(({ name, config, isOpen, toggleOpen, onChange }) => {
  const handleChange = useCallback((event) => {
    const target = event.target
    const item = target.name
    const value = target.type === 'checkbox' ? target.checked : target.value
    onChange(name, item, value)
  }, [name, onChange])

  const handleToggle = useCallback(() => {
    toggleOpen(name)
  }, [name, toggleOpen])

  const categoryContentClasses = classNames('category-content', {
    'hide-content': !isOpen
  })

  return (
    <div className='category-container'>
      <h3 className='category-title' onClick={handleToggle}>
        {name} config
      </h3>
      <div className={categoryContentClasses}>
        {Object.keys(config[name]).map((configItem) => {
          const { type, name: label, value, min, max, step } = config[name][configItem]

          if (type === 'checkbox') {
            return (
              <ConfigCheckbox
                name={configItem}
                label={label}
                key={configItem}
                checked={value}
                onChange={handleChange}
              />
            )
          }
          if (type === 'slider') {
            return (
              <ConfigSlider
                name={configItem}
                label={label}
                key={configItem}
                value={value}
                min={min}
                max={max}
                step={step}
                onChange={handleChange}
              />
            )
          }
          return null
        })}
      </div>
    </div>
  )
})

export default connectConfig(ConfigCategory)
