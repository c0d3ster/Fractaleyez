import React, { useCallback, useEffect, useMemo, useState } from 'react'

import { ConfirmModal } from '../common/ConfirmModal'

import { ConfigSlider } from './ConfigSlider'
import { ConfigCheckbox } from './ConfigCheckbox'
import { ConfigStepperToggle } from './ConfigStepperToggle'
import { SpinDial } from './SpinDial'
import { KaleidoscopeDial } from './KaleidoscopeDial'
import { Heading, logoHeading, userHeading } from '../../config/heading'
import { EFFECT_KEYS } from './useGalaxyMotion'
import { useKaleidoscopeDial } from './useKaleidoscopeDial'
import { connectConfigActions, ConfigContextValue, ConfigSectionKey } from './context/ConfigProvider'
import { shallowEqual } from './context/configStore'
import { useConfigSelector } from './context/useConfigSelector'
import { AppConfig, ConfigItem, SliderItem } from '../../config/configDefaults'
import { SCALE_ZONES, SliderZone } from '../../config/juliaScale.config'
import { ghostKey } from '../../utils/ghostStore'
import {
  isParticleLoadKey,
  maxValueUnderLoad,
  ParticleLoadInputs,
  ParticleLoadKey,
  particleLoad,
  particleLoadZones,
  PARTICLE_LOAD_RED,
  totalParticles,
  ZONE_COLORS,
} from '../../config/particleLoad.config'
import { userConfig } from '../../config/user.config'

// Per-field overrides for how a slider's raw numeric value is displayed; the raw value
// itself (min/max/step/onChange) is untouched, only the text shown next to the slider.
const SLIDER_DISPLAY_FORMATTERS: Partial<Record<string, (value: number) => string>> = {
  scaleFactor: (value) => `${(value / 1000).toFixed(2)}x`,
  sway: (value) => (value / 100).toFixed(1),
  // A named shape sets the Tour to its stop exactly, which is rarely a whole step.
  tour: (value) => String(Math.round(value * 10) / 10),
}

/** The text a slider shows for its value (the mobile one-slider buttons show the same). */
export const formatSliderValue = (item: string, value: number): string => SLIDER_DISPLAY_FORMATTERS[item]?.(value) ?? String(value)

// Sliders whose track is painted in zones (Scale: the Julia view's regimes).
const SLIDER_ZONES: Partial<Record<string, readonly SliderZone[]>> = {
  scaleFactor: SCALE_ZONES,
}

// Speed fades green to yellow to red as it gets more intense, like the spin dials' gauge. Unlike Scale's zones it
// matters to every layer, so it is always painted.
const SPEED_MIDDLE = (userConfig.speed_MIN + userConfig.speed_MAX) / 2
const ALWAYS_ZONES: Partial<Record<string, readonly SliderZone[]>> = {
  speed: [
    { upTo: SPEED_MIDDLE, color: ZONE_COLORS.safe, toColor: ZONE_COLORS.heavy },
    { upTo: userConfig.speed_MAX, color: ZONE_COLORS.heavy, toColor: ZONE_COLORS.red },
  ],
}

// Checkboxes drawn as a stepper tile, mapped to the slider item that holds their amount (the slider gets no row of its own).
const STEPPER_AMOUNTS: Partial<Record<string, string>> = {
  kaleidoscope: 'kaleidoscopeCount',
}
const STEPPER_AMOUNT_ITEMS: readonly string[] = [...Object.values(STEPPER_AMOUNTS).filter((item): item is string => item !== undefined), 'kaleidoscopeMode', 'kaleidoscopeSource']

// Items a pad edits (the logo's position and zoom focus, the fractal's Type above the Shape pad): stored like any slider, but they get
// no row of their own.
const PAD_ITEMS: Partial<Record<string, readonly string[]>> = {
  logo: ['positionX', 'positionY', 'focusX', 'focusY'],
  fractal: ['family'],
}

// Speed settings that turn something. They are drawn as a dial, not a slider, which also shows and sets which way it points.
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
  /** Draw the rotation settings as plain sliders instead of dials (the mobile one-slider pattern). */
  noDials?: boolean
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
  /** The particle sliders, for the Particle list's red-zone check. */
  particlesPerLayer: number
  layers: number
  levels: number
  particleSize: number
  /** Whether the fractal layer is on (its sliders show their zones only then). */
  fractalOn: boolean
}

const ConfigSectionItemsInner = ({ name, only, noDials = false, onChange, resetConfigItem, isSignedIn, userSettings, updateUserSettings }: ConfigSectionItemsProps): React.ReactElement => {
  // Reads only what this list draws, so a slider moved in another section does not render this one again.
  const selectView = useCallback((config: AppConfig): SectionView => {
    const isParticle = name === 'particle'
    const { particle } = config
    return {
      section: (config as unknown as Record<string, Record<string, ConfigItem>>)[name] ?? NO_ITEMS,
      particlesPerLayer: isParticle ? particle.particlesPerLayer.value : 0,
      layers: isParticle ? particle.layers.value : 0,
      levels: isParticle ? particle.levels.value : 0,
      particleSize: isParticle ? particle.particleSize.value : 0,
      fractalOn: config.layers.meta.fractal.enabled.value,
    }
  }, [name])
  const { section: categoryConfig, particlesPerLayer, layers, levels, particleSize, fractalOn } = useConfigSelector(selectView, shallowEqual)

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

  // The Effects list leads with the dial (which also holds the effect switches); only the full list draws it.
  const dial = useKaleidoscopeDial(name === 'effects' && !only, onChange, resetConfigItem)

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
      {dial && <KaleidoscopeDial {...dial} />}
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
              ghostKey={ghostKey(name, configItem)}
              key={configItem}
              checked={value as boolean}
              onChange={handleChange}
            />
          )
        }
        if (type === 'slider') {
          const { min, max, step } = item as SliderItem
          const heading = noDials ? undefined : HEADINGS[`${name}.${configItem}`]
          // A rotation setting is a dial, which also shows and sets which way it is pointing.
          if (heading) {
            return (
              <SpinDial
                key={configItem}
                label={label}
                description={item.description}
                value={value as number}
                min={min}
                max={max}
                step={step}
                heading={heading}
                onChange={(next) => onChange(name, configItem, String(next))}
                onReset={() => { if (isResettableSection(name)) resetConfigItem(name, configItem) }}
              />
            )
          }
          return (
            <ConfigSlider
              name={configItem}
              label={label}
              description={item.description}
              ghostKey={ghostKey(name, configItem)}
              key={configItem}
              value={value as number}
              displayValue={SLIDER_DISPLAY_FORMATTERS[configItem]?.(value as number)}
              zones={name === 'particle' && isParticleLoadKey(configItem)
                ? particleLoadZones(loadInputs, configItem, min, max)
                : ALWAYS_ZONES[configItem] ?? (fractalOn ? SLIDER_ZONES[configItem] : undefined)}
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
export const ConfigSectionItems = connectConfigActions(ConfigSectionItemsInner)
