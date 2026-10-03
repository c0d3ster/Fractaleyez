import React, { useCallback, useEffect, useMemo, useState } from 'react'
import classNames from 'classnames'
import './ConfigCategory.css'

import { ConfirmModal } from '../common/ConfirmModal'

import { ConfigSlider } from './ConfigSlider'
import { ConfigCheckbox } from './ConfigCheckbox'
import { connectConfig, ConfigContextValue, ConfigSectionKey } from './context/ConfigProvider'
import { AppConfig, ConfigItem, LayerKey, SliderItem } from '../../config/configDefaults'
import { SCALE_ZONES, SliderZone } from '../../config/juliaScale.config'
import {
  isParticleLoadKey,
  maxValueUnderLoad,
  ParticleLoadInputs,
  ParticleLoadKey,
  particleLoad,
  particleLoadZones,
  PARTICLE_LOAD_RED,
  totalParticles,
} from '../../config/particleLoad.config'

// Per-field overrides for how a slider's raw numeric value is displayed; the raw value
// itself (min/max/step/onChange) is untouched, only the text shown next to the slider.
const SLIDER_DISPLAY_FORMATTERS: Partial<Record<string, (value: number) => string>> = {
  scaleFactor: (value) => `${(value / 1000).toFixed(2)}x`,
  cameraBound: (value) => (value / 100).toFixed(1),
}

// Categories that only matter while one layer is enabled; they grey out otherwise.
const CATEGORY_LAYER: Partial<Record<string, LayerKey>> = {
  fractal: 'fractal',
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
  isSignedIn: ConfigContextValue['isSignedIn']
  userSettings: ConfigContextValue['userSettings']
  updateUserSettings: ConfigContextValue['updateUserSettings']
  children?: React.ReactNode
}

// A load-slider change held back at the red zone's edge until the user confirms it.
type PendingRedChange = {
  item: ParticleLoadKey
  value: number
}

const ConfigCategoryInner = React.memo(({ name, config, isOpen, expanded = false, toggleOpen, onChange, resetConfigItem, resetConfigSection, isSignedIn, userSettings, updateUserSettings, children }: ConfigCategoryProps) => {
  // Load comes from the count, layers, levels and size sliders together, not any one in isolation.
  const { particlesPerLayer, layers, levels, particleSize } = config.particle
  const loadInputs = useMemo<ParticleLoadInputs>(() => ({
    particlesPerLayer: particlesPerLayer.value,
    layers: layers.value,
    levels: levels.value,
    particleSize: particleSize.value,
  }), [particlesPerLayer.value, layers.value, levels.value, particleSize.value])
  const isRedZone = name === 'particle' && particleLoad(loadInputs) > PARTICLE_LOAD_RED

  const [redUnlocked, setRedUnlocked] = useState(false)
  const [pendingRed, setPendingRed] = useState<PendingRedChange | null>(null)
  const [dontShowAgain, setDontShowAgain] = useState(false)
  // Signed-in users can opt out of the warning for good; it is then saved to their settings.
  const skipWarning = userSettings?.skipRedZoneWarning === true

  // Confirming only unlocks the red zone for as long as the config stays in it.
  useEffect(() => {
    if (!isRedZone) setRedUnlocked(false)
  }, [isRedZone])

  const handleChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const target = event.target
    const item = target.name
    if (target.type === 'checkbox') {
      onChange(name, item, target.checked)
      return
    }
    if (name === 'particle' && isParticleLoadKey(item)) {
      const next = Number(target.value)
      const wouldBeRed = particleLoad({ ...loadInputs, [item]: next }) > PARTICLE_LOAD_RED
      // Only pushing further into the red is held back; easing off is always allowed.
      if (wouldBeRed && next > loadInputs[item] && !redUnlocked && !skipWarning) {
        if (pendingRed) return
        // Stop the slider at the red zone's edge (or leave it where it is if already past it).
        const edge = maxValueUnderLoad(loadInputs, item, PARTICLE_LOAD_RED, Number(target.min), Number(target.max))
        if (edge > loadInputs[item]) onChange(name, item, String(edge))
        setPendingRed({ item, value: next })
        return
      }
    }
    onChange(name, item, target.value)
  }, [name, onChange, loadInputs, redUnlocked, skipWarning, pendingRed])

  const handleRedConfirm = useCallback(() => {
    if (!pendingRed) return
    setRedUnlocked(true)
    if (dontShowAgain) updateUserSettings({ skipRedZoneWarning: true })
    onChange(name, pendingRed.item, String(pendingRed.value))
    setPendingRed(null)
    setDontShowAgain(false)
  }, [name, onChange, pendingRed, dontShowAgain, updateUserSettings])

  const handleRedCancel = useCallback(() => {
    setPendingRed(null)
    setDontShowAgain(false)
  }, [])

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

  const owner = CATEGORY_LAYER[name]
  const dimmed = owner !== undefined && !config.layers.meta[owner].enabled.value

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

  return (
    <div className={classNames('category-container', { 'category-container--effects': name === 'effects', 'config-inactive': dimmed })}>
      <h3 className='category-title' onClick={handleToggle}>
        {name} config
        {!expanded && resetButton}
      </h3>
      {expanded && resetButton}
      {pendingRed && (
        <ConfirmModal
          title='Heavy load ahead'
          confirmLabel='Go into the red anyway'
          cancelLabel='Stay safe'
          onConfirm={handleRedConfirm}
          onCancel={handleRedCancel}
          option={isSignedIn ? { label: 'Don’t show this again', checked: dontShowAgain, onChange: setDontShowAgain } : undefined}
        >
          Going past this point means about {totalParticles({ ...loadInputs, [pendingRed.item]: pendingRed.value }).toLocaleString()} particles.
          That can freeze or crash your browser, and swapping presets will stutter.
        </ConfirmModal>
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
                zones={name === 'particle' && isParticleLoadKey(configItem)
                  ? particleLoadZones(loadInputs, configItem, min, max)
                  : config.layers.meta.fractal.enabled.value ? SLIDER_ZONES[configItem] : undefined}
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
