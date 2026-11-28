import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { audioAnalysis } from '../../audio'
import type { AppConfig, LayerKey } from '../../config/configDefaults'
import { LAYER_REGISTRY } from '../../config/layers'
import { shallowEqual } from '../config/context/configStore'
import { useConfigSelector } from '../config/context/useConfigSelector'
import { createPulse, pulsingEffects } from '../config/effectPulse'
import { EFFECT_KEYS, type EffectKey, type MotionEffects } from '../config/useGalaxyMotion'
import { previewLock } from '../presets/previewLock'
import { EffectIcon, type EffectIconKey, MenuIcon } from './EffectIcons'
import { createLongPress } from './longPress'
import { openMenu } from './menuBus'
import type { BarState } from './shellChrome'

// The mobile shell's bottom bar (docs/mobile-design/TopC.html): the layer buttons and the menu button on the first row, one
// button per effect on the second.

/** In order of importance, not the desktop's hotkey order. */
export const BAR_LAYERS: readonly LayerKey[] = ['fractal', 'orbit', 'logo', 'video']

const SHAKE_MS = 400

type LayerButtonProps = { layerKey: LayerKey }

/** A tap toggles the layer like its hotkey; a long-press opens the menu on the layer's page instead. */
const LayerButton = ({ layerKey }: LayerButtonProps): React.ReactElement => {
  const enabled = useConfigSelector((config) => config.layers.meta[layerKey].enabled.value)
  const [shaking, setShaking] = useState(false)
  const firedRef = useRef(false)
  const { label, hotkey } = LAYER_REGISTRY[layerKey]

  const longPress = useMemo(() => createLongPress({
    onFire: () => {
      firedRef.current = true
      openMenu(layerKey)
    },
  }), [layerKey])
  useEffect(() => () => longPress.cancel(), [longPress])

  useEffect(() => {
    if (!shaking) return undefined
    const timer = window.setTimeout(() => setShaking(false), SHAKE_MS)
    return () => window.clearTimeout(timer)
  }, [shaking])

  const handleClick = useCallback(() => {
    // The click that ends a long-press is not a tap.
    if (firedRef.current) {
      firedRef.current = false
      return
    }
    // A premium preview locks the config, the layer hotkeys included.
    if (previewLock.isLocked()) return
    // Refused past the layer cap.
    if (window.setLayerEnabled?.(layerKey, !window.config.layers.meta[layerKey].enabled.value) === false) setShaking(true)
  }, [layerKey])

  return (
    <button
      type='button'
      className={`mobile-bar__button mobile-bar__layer${enabled ? ' mobile-bar__layer--on' : ''}${shaking ? ' mobile-bar__button--shake' : ''}`}
      aria-label={`${label} layer`}
      aria-pressed={enabled}
      data-layer={layerKey}
      onPointerDown={(event) => {
        firedRef.current = false
        longPress.down(event.pointerId, { x: event.clientX, y: event.clientY })
      }}
      onPointerMove={(event) => longPress.move(event.pointerId, { x: event.clientX, y: event.clientY })}
      onPointerUp={(event) => longPress.up(event.pointerId)}
      onPointerCancel={() => longPress.cancel()}
      onContextMenu={(event) => event.preventDefault()}
      onClick={handleClick}
    >
      {hotkey.toUpperCase()}
    </button>
  )
}

type BarEffects = MotionEffects & { kaleidoscope: boolean }

const selectEffects = (config: AppConfig): BarEffects => ({
  cyclone: config.effects.cyclone.value === true,
  wobWob: config.effects.wobWob.value === true,
  switcheroo: config.effects.switcheroo.value === true,
  colorShift: config.effects.colorShift.value === true,
  shockwave: config.effects.shockwave.value === true,
  glow: config.effects.glow.value === true,
  kaleidoscope: config.effects.kaleidoscope.value === true,
})

const selectEffectNames = (config: AppConfig): Record<EffectIconKey, string> => ({
  cyclone: config.effects.cyclone.name,
  wobWob: config.effects.wobWob.name,
  switcheroo: config.effects.switcheroo.name,
  colorShift: config.effects.colorShift.name,
  shockwave: config.effects.shockwave.name,
  glow: config.effects.glow.name,
  kaleidoscope: config.effects.kaleidoscope.name,
})

/** The kaleidoscope comes last on the phone: its icon reads as one effect among the rest. */
const BAR_EFFECTS: readonly EffectIconKey[] = [...EFFECT_KEYS, 'kaleidoscope']

const toggleEffect = (key: EffectIconKey): void => {
  if (previewLock.isLocked()) return
  // The same path as the desktop chips (EffectChips' onToggle and the kaleidoscope's own switch): one config item each.
  window.updateConfigItem?.('effects', key, !window.config.effects[key].value)
}

/** Flashes the buttons of the beat-driven effects that are on, on every beat, while `active`. */
const useBeatPulse = (active: boolean, effects: BarEffects, buttons: React.RefObject<Partial<Record<EffectKey, HTMLButtonElement | null>>>): void => {
  const latest = useRef(effects)
  useEffect(() => {
    latest.current = effects
  })
  useEffect(() => {
    if (!active) return undefined
    const flash = createPulse()
    return audioAnalysis.beatMonitor.subscribe(() => {
      pulsingEffects(latest.current, EFFECT_KEYS).forEach((key) => {
        const button = buttons.current?.[key]
        if (button) flash(button)
      })
    })
  }, [active, buttons])
}

export const BottomBar = ({ state }: { state: BarState }): React.ReactElement => {
  const effects = useConfigSelector(selectEffects, shallowEqual)
  const names = useConfigSelector(selectEffectNames, shallowEqual)
  const buttons = useRef<Partial<Record<EffectKey, HTMLButtonElement | null>>>({})
  useBeatPulse(state === 'shown', effects, buttons)

  return (
    <div className='mobile-bar' data-mobile-bar={state} aria-hidden={state !== 'shown'}>
      <div className='mobile-bar__row' role='group' aria-label='Layers'>
        {BAR_LAYERS.map((key) => <LayerButton key={key} layerKey={key} />)}
        <button type='button' className='mobile-bar__button mobile-bar__menu' aria-label='Open menu' onClick={() => openMenu()}>
          <MenuIcon />
        </button>
      </div>
      <div className='mobile-bar__row' role='group' aria-label='Effects'>
        {BAR_EFFECTS.map((key) => (
          <button
            key={key}
            ref={key === 'kaleidoscope' ? undefined : (element) => { buttons.current[key] = element }}
            type='button'
            className={`mobile-bar__button mobile-bar__effect${effects[key] ? ' mobile-bar__effect--on' : ''}`}
            aria-label={names[key]}
            aria-pressed={effects[key]}
            data-effect={key}
            onClick={() => toggleEffect(key)}
          >
            <EffectIcon effect={key} />
          </button>
        ))}
      </div>
    </div>
  )
}
