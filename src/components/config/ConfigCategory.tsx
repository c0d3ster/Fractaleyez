import React, { useCallback } from 'react'
import classNames from 'classnames'
import './ConfigCategory.css'

import { ConfigSlider } from './ConfigSlider'
import { ConfigCheckbox } from './ConfigCheckbox'
import { connectConfig } from './context/ConfigProvider'
import { useVisualizerActive, VisualizerActive } from './useVisualizerActive'
import { AppConfig, ConfigItem, SliderItem } from '../../config/configDefaults'
import { SCALE_ZONES, SliderZone } from '../../config/juliaScale.config'

// Per-field overrides for how a slider's raw numeric value is displayed; the raw value
// itself (min/max/step/onChange) is untouched, only the text shown next to the slider.
const SLIDER_DISPLAY_FORMATTERS: Partial<Record<string, (value: number) => string>> = {
  scaleFactor: (value) => `${(value / 1000).toFixed(2)}x`,
  cameraBound: (value) => (value / 100).toFixed(1),
}

// Categories that only matter while one visualizer is on; they grey out otherwise.
const CATEGORY_VISUALIZER: Partial<Record<string, keyof VisualizerActive>> = {
  fractal: 'julia',
  particle: 'orbit',
  orbit: 'orbit',
}

// Sliders whose track is painted in zones (Scale: the Julia view's regimes).
const SLIDER_ZONES: Partial<Record<string, readonly SliderZone[]>> = {
  scaleFactor: SCALE_ZONES,
}

type ConfigCategoryProps = {
  name: string
  config: AppConfig
  isOpen: boolean
  toggleOpen: (name: string) => void
  onChange: (category: string, item: string, value: string | boolean) => void
  children?: React.ReactNode
}

const ConfigCategoryInner = React.memo(({ name, config, isOpen, toggleOpen, onChange, children }: ConfigCategoryProps) => {
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

  const active = useVisualizerActive()
  const owner = CATEGORY_VISUALIZER[name]
  const dimmed = owner !== undefined && !active[owner]

  const categoryConfig = (config as unknown as Record<string, Record<string, ConfigItem>>)[name] ?? {}

  return (
    <div className={classNames('category-container', { 'category-container--effects': name === 'effects', 'config-inactive': dimmed })}>
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
                zones={active.julia ? SLIDER_ZONES[configItem] : undefined}
                min={min}
                max={max}
                step={step}
                onChange={handleChange}
              />
            )
          }
          return null
        })}
        {children}
      </div>
    </div>
  )
})

export const ConfigCategory = connectConfig(ConfigCategoryInner)
