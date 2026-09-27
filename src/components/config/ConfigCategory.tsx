import React, { useCallback } from 'react'
import classNames from 'classnames'
import './ConfigCategory.css'

import { ConfigSlider } from './ConfigSlider'
import { ConfigCheckbox } from './ConfigCheckbox'
import { connectConfig, ConfigContextValue, ConfigSectionKey } from './context/ConfigProvider'
import { useVisualizerActive, VisualizerActive } from './useVisualizerActive'
import { AppConfig, ConfigItem, SliderItem } from '../../config/configDefaults'
import { SCALE_ZONES, SliderZone } from '../../config/juliaScale.config'
import { PARTICLE_COUNT_RED_ZONE_THRESHOLD } from '../../config/particle.config'

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

// Sections whose items live in the preset and can be reset to its loaded values (video has its own controls).
const RESETTABLE_SECTIONS: readonly ConfigSectionKey[] = ['user', 'fractal', 'audio', 'effects', 'particle', 'orbit']
const isResettableSection = (name: string): name is ConfigSectionKey => RESETTABLE_SECTIONS.some((section) => section === name)

type ConfigCategoryProps = {
  name: string
  config: AppConfig
  isOpen: boolean
  // The pop-out config window: the reset icon sits above the header there, and inside it in the sidebar.
  expanded?: boolean
  toggleOpen: (name: string) => void
  onChange: (category: string, item: string, value: string | boolean) => void
  resetConfigItem: ConfigContextValue['resetConfigItem']
  resetConfigSection: ConfigContextValue['resetConfigSection']
  children?: React.ReactNode
}

const ConfigCategoryInner = React.memo(({ name, config, isOpen, expanded = false, toggleOpen, onChange, resetConfigItem, resetConfigSection, children }: ConfigCategoryProps) => {
  const handleChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const target = event.target
    const item = target.name
    const value = target.type === 'checkbox' ? target.checked : target.value
    onChange(name, item, value)
  }, [name, onChange])

  const handleItemReset = useCallback((event: React.MouseEvent<HTMLInputElement>) => {
    if (isResettableSection(name)) resetConfigItem(name, event.currentTarget.name)
  }, [name, resetConfigItem])

  const handleSectionReset = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    // In the sidebar the button lives inside the header, whose click toggles the section.
    event.stopPropagation()
    if (isResettableSection(name)) void resetConfigSection(name)
  }, [name, resetConfigSection])

  const handleToggle = useCallback(() => {
    toggleOpen(name)
  }, [name, toggleOpen])

  const categoryContentClasses = classNames('category-content', {
    'hide-content': !isOpen
  })

  const active = useVisualizerActive()
  const owner = CATEGORY_VISUALIZER[name]
  const dimmed = owner !== undefined && !active[owner]

  const resetButton = isResettableSection(name) && (
    <button
      type='button'
      className={classNames('category-reset', { 'category-reset--in-header': !expanded })}
      title='Reset this section to the preset'
      aria-label={`Reset ${name} config`}
      onClick={handleSectionReset}
    >
      <svg viewBox='0 0 24 24' width='15' height='15' fill='none' stroke='currentColor' strokeWidth='3' strokeLinecap='round' strokeLinejoin='round' aria-hidden>
        <path d='M3.3 14.3A9 9 0 1 0 12 3a9.75 9.75 0 0 0-6.74 2.74L3 8' />
        <path d='M3 3v5h5' />
      </svg>
    </button>
  )

  const categoryConfig = (config as unknown as Record<string, Record<string, ConfigItem>>)[name] ?? {}

  // Total particle count is what drives GPU load (see README's Particle Config warning), not either
  // slider read in isolation.
  const totalParticleCount = name === 'particle' ? config.particle.particlesPerLayer.value * config.particle.layers.value : 0
  const isRedZone = totalParticleCount > PARTICLE_COUNT_RED_ZONE_THRESHOLD

  return (
    <div className={classNames('category-container', { 'category-container--effects': name === 'effects', 'config-inactive': dimmed })}>
      <h3 className='category-title' onClick={handleToggle}>
        {name} config
        {!expanded && resetButton}
      </h3>
      {expanded && resetButton}
      {isRedZone && (
        <div className='category-warning' role='alert'>
          Red zone: {totalParticleCount.toLocaleString()} particles exceeds the performance threshold
          ({PARTICLE_COUNT_RED_ZONE_THRESHOLD.toLocaleString()}). This can overload your GPU.
        </div>
      )}
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
                onReset={handleItemReset}
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
