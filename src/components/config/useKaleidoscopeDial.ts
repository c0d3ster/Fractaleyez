import { useCallback, useMemo } from 'react'

import { type ColorState, resolveColorState } from '../../config/colorState'
import type { AppConfig } from '../../config/configDefaults'
import type { ConfigContextValue } from './context/ConfigProvider'
import { shallowEqual } from './context/configStore'
import { useConfigSelector } from './context/useConfigSelector'
import type { EffectKey, MotionEffects } from './useGalaxyMotion'

// The KaleidoscopeDial's wiring to the config: what it shows and what its knob, modes and switches change. Shared by the desktop
// Effects section (ConfigSectionItems) and the mobile Effects tab, so the two dials behave the same.

/** What the dial reads; nothing else, so a slider elsewhere does not redraw it. */
type DialView = {
  effects: AppConfig['effects']
  color: AppConfig['color']
  scaleFactor: number
  particleSize: number
  rotationSpeed: number
}

const selectDialView = (config: AppConfig): DialView => ({
  effects: config.effects,
  color: config.color,
  scaleFactor: config.user.scaleFactor.value,
  particleSize: config.particle.particleSize.value,
  rotationSpeed: config.user.rotationSpeed.value,
})

const selectNothing = (): null => null

const sameView = (a: DialView | null, b: DialView | null): boolean => a === b || (a !== null && b !== null && shallowEqual(a, b))

/** The KaleidoscopeDial props that come from the config. */
export type KaleidoscopeDialWiring = {
  count: number
  min: number
  max: number
  step: number
  kaleidoscope: boolean
  mode: number
  source: number
  onSourceChange: (source: number) => void
  onModeChange: (mode: number) => void
  palette: ColorState
  scale: number
  particleSize: number
  rotationSpeed: number
  effects: MotionEffects
  effectLabels: Readonly<Record<EffectKey, string>>
  onToggleEffect: (key: EffectKey, enabled: boolean) => void
  kaleidoscopeLabel: string
  onToggleKaleidoscope: (enabled: boolean) => void
  onChange: (count: number) => void
  onReset: () => void
}

type ChangeItem = (category: string, item: string, value: string | boolean) => void

/**
 * The dial's props, or null while `active` is false (a list of another section calls this too, and reads nothing then). What
 * the dial is given is kept stable: it is expensive to redraw, so it only renders again when something it shows has changed.
 */
export const useKaleidoscopeDial = (active: boolean, onChange: ChangeItem, resetConfigItem: ConfigContextValue['resetConfigItem']): KaleidoscopeDialWiring | null => {
  const view = useConfigSelector<DialView | null>(active ? selectDialView : selectNothing, sameView)
  const effects = view?.effects
  const color = view?.color

  const dialEffects = useMemo<MotionEffects | null>(
    () => (effects ? { cyclone: effects.cyclone.value, wobWob: effects.wobWob.value, switcheroo: effects.switcheroo.value, colorShift: effects.colorShift.value, shockwave: effects.shockwave.value, glow: effects.glow.value } : null),
    [effects?.cyclone.value, effects?.wobWob.value, effects?.switcheroo.value, effects?.colorShift.value, effects?.shockwave.value, effects?.glow.value],
  )
  const dialEffectLabels = useMemo<Readonly<Record<EffectKey, string>> | null>(
    () => (effects ? { cyclone: effects.cyclone.name, wobWob: effects.wobWob.name, switcheroo: effects.switcheroo.name, colorShift: effects.colorShift.name, shockwave: effects.shockwave.name, glow: effects.glow.name } : null),
    [effects?.cyclone.name, effects?.wobWob.name, effects?.switcheroo.name, effects?.colorShift.name, effects?.shockwave.name, effects?.glow.name],
  )
  // Cached by its inputs, so the same palette comes back while the colors are unchanged.
  const palette = color ? resolveColorState(color) : null
  const onToggleEffect = useCallback((key: EffectKey, enabled: boolean) => onChange('effects', key, enabled), [onChange])
  const onModeChange = useCallback((mode: number) => onChange('effects', 'kaleidoscopeMode', String(mode)), [onChange])
  const onSourceChange = useCallback((source: number) => onChange('effects', 'kaleidoscopeSource', String(source)), [onChange])
  const onCountChange = useCallback((count: number) => onChange('effects', 'kaleidoscopeCount', String(count)), [onChange])
  const onToggleKaleidoscope = useCallback((enabled: boolean) => onChange('effects', 'kaleidoscope', enabled), [onChange])
  const onReset = useCallback(() => resetConfigItem('effects', 'kaleidoscopeCount'), [resetConfigItem])

  if (!view || !effects || !palette || !dialEffects || !dialEffectLabels) return null
  return {
    count: effects.kaleidoscopeCount.value,
    min: effects.kaleidoscopeCount.min,
    max: effects.kaleidoscopeCount.max,
    step: effects.kaleidoscopeCount.step,
    kaleidoscope: effects.kaleidoscope.value,
    mode: effects.kaleidoscopeMode.value,
    source: effects.kaleidoscopeSource.value,
    onSourceChange,
    onModeChange,
    palette,
    scale: view.scaleFactor,
    particleSize: view.particleSize,
    rotationSpeed: view.rotationSpeed,
    effects: dialEffects,
    effectLabels: dialEffectLabels,
    onToggleEffect,
    kaleidoscopeLabel: effects.kaleidoscope.name,
    onToggleKaleidoscope,
    onChange: onCountChange,
    onReset,
  }
}
