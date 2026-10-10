import React, { useCallback, useEffect, useMemo, useState } from 'react'

import { ConfirmModal } from '../common/ConfirmModal'

import { ConfigSlider } from './ConfigSlider'
import { ConfigCheckbox } from './ConfigCheckbox'
import { ConfigStepperToggle } from './ConfigStepperToggle'
import { KaleidoscopeDial } from './KaleidoscopeDial'
import { EFFECT_KEYS, EffectKey, MotionEffects } from './useGalaxyMotion'
import { connectConfig, ConfigContextValue, ConfigSectionKey } from './context/ConfigProvider'
import { resolveColorState } from '../../config/colorState'
import { AppConfig, ConfigItem, SliderItem } from '../../config/configDefaults'
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

// Sliders whose track is painted in zones (Scale: the Julia view's regimes).
const SLIDER_ZONES: Partial<Record<string, readonly SliderZone[]>> = {
  scaleFactor: SCALE_ZONES,
}

// Checkboxes drawn as a stepper tile, mapped to the slider item that holds their amount (the slider gets no row of its own).
const STEPPER_AMOUNTS: Partial<Record<string, string>> = {
  kaleidoscope: 'kaleidoscopeCount',
}
const STEPPER_AMOUNT_ITEMS: readonly string[] = Object.values(STEPPER_AMOUNTS).filter((item): item is string => item !== undefined)

// Sections whose items live in the preset and can be reset to its loaded values (video is reset by ConfigVideo, since
// its clip list is not a plain section).
const RESETTABLE_SECTIONS: readonly ConfigSectionKey[] = ['user', 'fractal', 'audio', 'effects', 'color', 'particle', 'orbit', 'logo']
export const isResettableSection = (name: string): name is ConfigSectionKey => RESETTABLE_SECTIONS.some((section) => section === name)

// A load-slider change held back at the red zone's edge until the user confirms it.
type PendingRedChange = {
  item: ParticleLoadKey
  value: number
}

type ConfigSectionItemsProps = {
  name: string
  /** Render just these items (the Color section is laid out in pieces around its own controls). */
  only?: readonly string[]
  config: AppConfig
  onChange: (category: string, item: string, value: string | boolean) => void
  resetConfigItem: ConfigContextValue['resetConfigItem']
  isSignedIn: ConfigContextValue['isSignedIn']
  userSettings: ConfigContextValue['userSettings']
  updateUserSettings: ConfigContextValue['updateUserSettings']
}

const ConfigSectionItemsInner = ({ name, only, config, onChange, resetConfigItem, isSignedIn, userSettings, updateUserSettings }: ConfigSectionItemsProps): React.ReactElement => {
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

  const categoryConfig = (config as unknown as Record<string, Record<string, ConfigItem>>)[name] ?? {}

  // The dial is expensive to redraw, and this re-renders on every config change, so what it is given is kept stable:
  // it only re-renders when something it shows has actually changed.
  const { cyclone, wobWob, switcheroo, colorShift, shockwave, glow } = config.effects
  const dialEffects = useMemo<MotionEffects>(
    () => ({ cyclone: cyclone.value, wobWob: wobWob.value, switcheroo: switcheroo.value, colorShift: colorShift.value, shockwave: shockwave.value, glow: glow.value }),
    [cyclone.value, wobWob.value, switcheroo.value, colorShift.value, shockwave.value, glow.value],
  )
  const dialEffectLabels = useMemo<Readonly<Record<EffectKey, string>>>(
    () => ({ cyclone: cyclone.name, wobWob: wobWob.name, switcheroo: switcheroo.name, colorShift: colorShift.name, shockwave: shockwave.name, glow: glow.name }),
    [cyclone.name, wobWob.name, switcheroo.name, colorShift.name, shockwave.name, glow.name],
  )
  const handleToggleEffect = useCallback((key: EffectKey, enabled: boolean) => onChange('effects', key, enabled), [onChange])
  const handleKaleidoscopeCount = useCallback((count: number) => onChange('effects', 'kaleidoscopeCount', String(count)), [onChange])
  const handleToggleKaleidoscope = useCallback((enabled: boolean) => onChange('effects', 'kaleidoscope', enabled), [onChange])
  const handleResetKaleidoscopeCount = useCallback(() => resetConfigItem('effects', 'kaleidoscopeCount'), [resetConfigItem])

  return (
    <>
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
      {name === 'effects' && !only && (
        <KaleidoscopeDial
          count={config.effects.kaleidoscopeCount.value}
          min={config.effects.kaleidoscopeCount.min}
          max={config.effects.kaleidoscopeCount.max}
          step={config.effects.kaleidoscopeCount.step}
          kaleidoscope={config.effects.kaleidoscope.value}
          palette={resolveColorState(config.color)}
          scale={config.user.scaleFactor.value}
          particleSize={config.particle.particleSize.value}
          rotationSpeed={config.user.rotationSpeed.value}
          effects={dialEffects}
          effectLabels={dialEffectLabels}
          onToggleEffect={handleToggleEffect}
          kaleidoscopeLabel={config.effects.kaleidoscope.name}
          onToggleKaleidoscope={handleToggleKaleidoscope}
          onChange={handleKaleidoscopeCount}
          onReset={handleResetKaleidoscopeCount}
        />
      )}
      {Object.keys(categoryConfig).filter((configItem) => !only || only.includes(configItem)).map((configItem) => {
        if (STEPPER_AMOUNT_ITEMS.includes(configItem)) return null
        // The effect switches, the kaleidoscope's included, live under the dial as chips, so they get no row of their own.
        if (name === 'effects' && !only && (configItem === 'kaleidoscope' || EFFECT_KEYS.some((key) => key === configItem))) return null
        const item = categoryConfig[configItem]!
        const { type, name: label, value } = item

        const amountKey = STEPPER_AMOUNTS[configItem]
        const amountItem = amountKey ? categoryConfig[amountKey] : undefined
        if (type === 'checkbox' && amountKey && amountItem?.type === 'slider') {
          return (
            <ConfigStepperToggle
              name={configItem}
              label={label}
              key={configItem}
              checked={value as boolean}
              amount={amountItem.value}
              min={amountItem.min}
              max={amountItem.max}
              step={amountItem.step}
              onToggle={(checked) => onChange(name, configItem, checked)}
              onAmountChange={(amount) => onChange(name, amountKey, String(amount))}
              onAmountReset={() => { if (isResettableSection(name)) resetConfigItem(name, amountKey) }}
            />
          )
        }
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
    </>
  )
}

/** The checkbox and slider rows of one config section, with the red-zone warning and per-item reset. */
export const ConfigSectionItems = connectConfig(ConfigSectionItemsInner)
