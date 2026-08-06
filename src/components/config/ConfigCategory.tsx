import React, { useCallback } from 'react'
import classNames from 'classnames'
import './ConfigCategory.css'

import { ConfigSlider } from './ConfigSlider'
import { ConfigCheckbox } from './ConfigCheckbox'
import { connectConfig } from './context/ConfigProvider'
import { AppConfig, ConfigItem, SliderItem } from '../../config/configDefaults'

// Per-field overrides for how a slider's raw numeric value is displayed; the raw value
// itself (min/max/step/onChange) is untouched, only the text shown next to the slider.
const SLIDER_DISPLAY_FORMATTERS: Partial<Record<string, (value: number) => string>> = {
  scaleFactor: (value) => `${(value / 1000).toFixed(1)}x`,
  cameraBound: (value) => (value / 100).toFixed(1),
}

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
                displayValue={SLIDER_DISPLAY_FORMATTERS[configItem]?.(value as number)}
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
