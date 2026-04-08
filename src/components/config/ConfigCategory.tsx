import React, { useCallback } from 'react'
import classNames from 'classnames'
import './ConfigCategory.css'

import { ConfigSlider } from './ConfigSlider'
import { ConfigCheckbox } from './ConfigCheckbox'
import { connectConfig } from './context/ConfigProvider'
import { AppConfig, ConfigItem, SliderItem } from '../../config/configDefaults'

type ConfigCategoryProps = {
  name: string
  config: AppConfig
  isOpen: boolean
  toggleOpen: (name: string) => void
  onChange: (category: string, item: string, value: string | boolean) => void
}

const ConfigCategoryInner = React.memo(({ name, config, isOpen, toggleOpen, onChange }: ConfigCategoryProps) => {
  const handleChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
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

  const categoryConfig = (config as unknown as Record<string, Record<string, ConfigItem>>)[name] ?? {}

  return (
    <div className={classNames('category-container', { 'category-container--effects': name === 'effects' })}>
      <h3 className='category-title' onClick={handleToggle}>
        {name} config
      </h3>
      <div className={categoryContentClasses}>
        {Object.keys(categoryConfig).map((configItem) => {
          const item = categoryConfig[configItem]!
          const { type, name: label, value } = item

          if (type === 'checkbox') {
            return (
              <ConfigCheckbox
                name={configItem}
                label={label}
                key={configItem}
                checked={value as boolean}
                onChange={handleChange}
              />
            )
          }
          if (type === 'slider') {
            const { min, max, step } = item as SliderItem
            return (
              <ConfigSlider
                name={configItem}
                label={label}
                key={configItem}
                value={value as number}
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

export const ConfigCategory = connectConfig(ConfigCategoryInner)
