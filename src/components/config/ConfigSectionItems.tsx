import React, { useCallback } from 'react'

import { ConfigSlider } from './ConfigSlider'
import { ConfigCheckbox } from './ConfigCheckbox'
import { AppConfig, ConfigItem, SliderItem } from '../../config/configDefaults'
import { SCALE_ZONES, SliderZone } from '../../config/juliaScale.config'

// Per-field overrides for how a slider's raw numeric value is displayed; the raw value
// itself (min/max/step/onChange) is untouched, only the text shown next to the slider.
const SLIDER_DISPLAY_FORMATTERS: Partial<Record<string, (value: number) => string>> = {
  scaleFactor: (value) => `${(value / 1000).toFixed(2)}x`,
  cameraBound: (value) => (value / 100).toFixed(1),
}

// Sliders whose track is painted in zones (Scale: the Julia view's regimes).
const SLIDER_ZONES: Partial<Record<string, readonly SliderZone[]>> = {
  scaleFactor: SCALE_ZONES,
}

type ConfigSectionItemsProps = {
  name: string
  config: AppConfig
  onChange: (category: string, item: string, value: string | boolean) => void
}

/** The checkbox and slider rows of one config section. */
export const ConfigSectionItems = ({ name, config, onChange }: ConfigSectionItemsProps): React.ReactElement => {
  const handleChange = useCallback((event: React.ChangeEvent<HTMLInputElement>): void => {
    const target = event.target
    const value = target.type === 'checkbox' ? target.checked : target.value
    onChange(name, target.name, value)
  }, [name, onChange])

  const categoryConfig = (config as unknown as Record<string, Record<string, ConfigItem>>)[name] ?? {}

  return (
    <>
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
              zones={config.layers.meta.fractal.enabled.value ? SLIDER_ZONES[configItem] : undefined}
              min={min}
              max={max}
              step={step}
              onChange={handleChange}
            />
          )
        }
        return null
      })}
    </>
  )
}
