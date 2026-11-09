import React, { useCallback, useEffect, useMemo, useState } from 'react'

import { ConfirmModal } from '../common/ConfirmModal'

import { ConfigSlider } from './ConfigSlider'
import { ConfigCheckbox } from './ConfigCheckbox'
import { ConfigStepperToggle } from './ConfigStepperToggle'
import { HeadingDial } from './HeadingDial'
import { KaleidoscopeDial } from './KaleidoscopeDial'
import { Heading, logoHeading, userHeading } from '../../config/heading'
import { EFFECT_KEYS, EffectKey, MotionEffects } from './useGalaxyMotion'
import { connectConfigActions, ConfigContextValue, ConfigSectionKey } from './context/ConfigProvider'
import { shallowEqual } from './context/configStore'
import { useConfigSelector } from './context/useConfigSelector'
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
  sway: (value) => (value / 100).toFixed(1),
}

// Sliders whose track is painted in zones (Scale: the Julia view's regimes).
const SLIDER_ZONES: Partial<Record<string, readonly SliderZone[]>> = {
  scaleFactor: SCALE_ZONES,
}

// Checkboxes drawn as a stepper tile, mapped to the slider item that holds their amount (the slider gets no row of its own).
const STEPPER_AMOUNTS: Partial<Record<string, string>> = {
  kaleidoscope: 'kaleidoscopeCount',
}
const STEPPER_AMOUNT_ITEMS: readonly string[] = [...Object.values(STEPPER_AMOUNTS).filter((item): item is string => item !== undefined), 'kaleidoscopeMode', 'kaleidoscopeSource']

// Items a pad edits (the logo's position and zoom focus): stored like any slider, but they get no row of their own.
const PAD_ITEMS: Partial<Record<string, readonly string[]>> = {
  logo: ['positionX', 'positionY', 'focusX', 'focusY'],
}

// Speed sliders that turn something, which get a compass under them showing and setting which way it points.
const HEADINGS: Partial<Record<string, Heading>> = {
  'user.rotationSpeed': userHeading,
  'logo.spinSpeed': logoHeading,
}

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
  onChange: (category: string, item: string, value: string | boolean) => void
  resetConfigItem: ConfigContextValue['resetConfigItem']
  isSignedIn: ConfigContextValue['isSignedIn']
  userSettings: ConfigContextValue['userSettings']
  updateUserSettings: ConfigContextValue['updateUserSettings']
}

const NO_ITEMS: Record<string, ConfigItem> = {}

/** The parts of the config one list of items reads. Anything a list does not draw is left out (null or 0), so a change there does not re-render it. */
type SectionView = {
  section: Record<string, ConfigItem>
  /** The particle sliders, for the Particle list's red-zone check; the Effects list's dial only reads the size. */
  particlesPerLayer: number
  layers: number
  levels: number
  particleSize: number
  /** The Effects list's dial. */
  effects: AppConfig['effects'] | null
  color: AppConfig['color'] | null
  scaleFactor: number
  rotationSpeed: number
  /** Whether the fractal layer is on (its sliders show their zones only then). */
  fractalOn: boolean
}

const ConfigSectionItemsInner = ({ name, only, onChange, resetConfigItem, isSignedIn, userSettings, updateUserSettings }: ConfigSectionItemsProps): React.ReactElement => {
  // Reads only what this list draws, so a slider moved in another section does not render this one again.
  const selectView = useCallback((config: AppConfig): SectionView => {
    const isParticle = name === 'particle'
    const isEffects = name === 'effects'
    const { particle } = config
    return {
      section: (config as unknown as Record<string, Record<string, ConfigItem>>)[name] ?? NO_ITEMS,
      particlesPerLayer: isParticle ? particle.particlesPerLayer.value : 0,
      layers: isParticle ? particle.layers.value : 0,
      levels: isParticle ? particle.levels.value : 0,
      particleSize: isParticle || isEffects ? particle.particleSize.value : 0,
      effects: isEffects ? config.effects : null,
      color: isEffects ? config.color : null,
      scaleFactor: isEffects ? config.user.scaleFactor.value : 0,
      rotationSpeed: isEffects ? config.user.rotationSpeed.value : 0,
      fractalOn: config.layers.meta.fractal.enabled.value,
    }
  }, [name])
  const { section: categoryConfig, particlesPerLayer, layers, levels, particleSize, effects, color, scaleFactor, rotationSpeed, fractalOn } = useConfigSelector(selectView, shallowEqual)

  // Load comes from the count, layers, levels and size sliders together, not any one in isolation.
  const loadInputs = useMemo<ParticleLoadInputs>(() => ({ particlesPerLayer, layers, levels, particleSize }), [particlesPerLayer, layers, levels, particleSize])
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

  // The dial is expensive to redraw, so what it is given is kept stable: it only re-renders when something it shows has actually changed.
  const dialEffects = useMemo<MotionEffects | null>(
    () => (effects ? { cyclone: effects.cyclone.value, wobWob: effects.wobWob.value, switcheroo: effects.switcheroo.value, colorShift: effects.colorShift.value, shockwave: effects.shockwave.value, glow: effects.glow.value } : null),
    [effects?.cyclone.value, effects?.wobWob.value, effects?.switcheroo.value, effects?.colorShift.value, effects?.shockwave.value, effects?.glow.value],
  )
  const dialEffectLabels = useMemo<Readonly<Record<EffectKey, string>> | null>(
    () => (effects ? { cyclone: effects.cyclone.name, wobWob: effects.wobWob.name, switcheroo: effects.switcheroo.name, colorShift: effects.colorShift.name, shockwave: effects.shockwave.name, glow: effects.glow.name } : null),
    [effects?.cyclone.name, effects?.wobWob.name, effects?.switcheroo.name, effects?.colorShift.name, effects?.shockwave.name, effects?.glow.name],
  )
  const handleToggleEffect = useCallback((key: EffectKey, enabled: boolean) => onChange('effects', key, enabled), [onChange])
  const handleKaleidoscopeMode = useCallback((mode: number) => onChange('effects', 'kaleidoscopeMode', String(mode)), [onChange])
  const handleKaleidoscopeSource = useCallback((source: number) => onChange('effects', 'kaleidoscopeSource', String(source)), [onChange])
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
      {name === 'effects' && !only && effects && color && dialEffects && dialEffectLabels && (
        <KaleidoscopeDial
          count={effects.kaleidoscopeCount.value}
          min={effects.kaleidoscopeCount.min}
          max={effects.kaleidoscopeCount.max}
          step={effects.kaleidoscopeCount.step}
          kaleidoscope={effects.kaleidoscope.value}
          mode={effects.kaleidoscopeMode.value}
          source={effects.kaleidoscopeSource.value}
          onSourceChange={handleKaleidoscopeSource}
          onModeChange={handleKaleidoscopeMode}
          palette={resolveColorState(color)}
          scale={scaleFactor}
          particleSize={particleSize}
          rotationSpeed={rotationSpeed}
          effects={dialEffects}
          effectLabels={dialEffectLabels}
          onToggleEffect={handleToggleEffect}
          kaleidoscopeLabel={effects.kaleidoscope.name}
          onToggleKaleidoscope={handleToggleKaleidoscope}
          onChange={handleKaleidoscopeCount}
          onReset={handleResetKaleidoscopeCount}
        />
      )}
      {Object.keys(categoryConfig).filter((configItem) => !only || only.includes(configItem)).map((configItem) => {
        if (STEPPER_AMOUNT_ITEMS.includes(configItem)) return null
        if (PAD_ITEMS[name]?.includes(configItem)) return null
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
              description={item.description}
              key={configItem}
              checked={value as boolean}
              onChange={handleChange}
            />
          )
        }
        if (type === 'slider') {
          const { min, max, step } = item as SliderItem
          const heading = HEADINGS[`${name}.${configItem}`]
          const slider = (
            <ConfigSlider
              name={configItem}
              label={label}
              description={item.description}
              key={configItem}
              value={value as number}
              displayValue={SLIDER_DISPLAY_FORMATTERS[configItem]?.(value as number)}
              zones={name === 'particle' && isParticleLoadKey(configItem)
                ? particleLoadZones(loadInputs, configItem, min, max)
                : fractalOn ? SLIDER_ZONES[configItem] : undefined}
              min={min}
              max={max}
              step={step}
              onChange={handleChange}
              onReset={handleItemReset}
            />
          )
          if (!heading) return slider
          return (
            <React.Fragment key={configItem}>
              {slider}
              <HeadingDial heading={heading} label={label} />
            </React.Fragment>
          )
        }
        return null
      })}
    </>
  )
}

/** The checkbox and slider rows of one config section, with the red-zone warning and per-item reset. */
export const ConfigSectionItems = connectConfigActions(ConfigSectionItemsInner)
