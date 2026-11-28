import React, { useCallback, useEffect, useRef } from 'react'

import { ghostKey, switchGhost } from '../../utils/ghostStore'
import { AutoSwitch } from '../config/AutoSwitch'
import { CameraTouchpad } from '../config/CameraTouchpad'
import { ConfigSectionItems } from '../config/ConfigSectionItems'
import { useConfigContext } from '../config/context/ConfigProvider'
import { useConfigSelector } from '../config/context/useConfigSelector'
import { useGhost } from '../config/context/useGhost'
import { KaleidoscopeModes } from '../config/EffectChips'
import { createPulse, pulsingEffects } from '../config/effectPulse'
import { KaleidoscopeDial } from '../config/KaleidoscopeDial'
import { PalettePicker } from '../config/PalettePicker'
import { PaletteRange } from '../config/PaletteRange'
import { EFFECT_KEYS, type EffectKey, type MotionEffects } from '../config/useGalaxyMotion'
import { useKaleidoscopeDial } from '../config/useKaleidoscopeDial'
import { SWAY_OFF_OPACITY, swayIsOff } from '../config/UserConfigBody'
import { EffectIcon } from './EffectIcons'
import { ONE_SLIDER_SETS } from './layerPages'
import { CAMERA_TAB_SLIDERS, COLOR_TAB_PILLS, EFFECTS_DIAL_PX, EFFECTS_TAB_EFFECTS, effectButtonLook } from './menuTabContents'
import { OneSliderSection } from './OneSliderSection'
import './MenuTabs.css'

// The menu sheet's Effects, Color and Camera tabs (docs/mobile-design/MenuFull.html, ColorTab.html, CameraTab.html). Each is the
// desktop's controls laid out for the sheet: the same dial, palette, range bar, sliders, pills and camera pad, wired the same way.

type EffectButtonProps = {
  effect: (typeof EFFECTS_TAB_EFFECTS)[number]
  label: string
  on: boolean
  onToggle: () => void
  buttonRef?: (element: HTMLButtonElement | null) => void
}

/** One effect: a round 44px icon button with its name under it on one line, lit while on, Auto's outline on the kaleidoscope. */
const EffectButton = ({ effect, label, on, onToggle, buttonRef }: EffectButtonProps): React.ReactElement => {
  // Only the kaleidoscope has an Auto ghost; the hook still runs for every button, with no key for the rest.
  const ghost = useGhost(effect === 'kaleidoscope' ? ghostKey('effects', 'kaleidoscope') : undefined)
  const look = effectButtonLook(on, switchGhost(ghost, on))
  return (
    <div className='mobile-effect'>
      <button
        ref={buttonRef}
        type='button'
        className={`mobile-effect__button mobile-effect__button--${look}`}
        aria-label={label}
        aria-pressed={on}
        data-menu-effect={effect}
        data-look={look}
        onClick={onToggle}
      >
        <EffectIcon effect={effect} />
      </button>
      <span className='mobile-effect__name'>{label}</span>
    </div>
  )
}

/** The dial leads, as on desktop, with the mirror count and the mirror modes beside it; then every effect; Auto at the bottom. */
const EffectsTab = (): React.ReactElement | null => {
  const { updateConfigItem, resetConfigItem } = useConfigContext()
  const dial = useKaleidoscopeDial(true, updateConfigItem, resetConfigItem)
  const buttons = useRef<Partial<Record<EffectKey, HTMLButtonElement | null>>>({})
  const flash = useRef(createPulse())
  // The flash reads the latest switches from here, so a beat never waits for a render.
  const latest = useRef<MotionEffects | null>(dial?.effects ?? null)
  useEffect(() => {
    latest.current = dial?.effects ?? null
  })

  // The dial hears the beats; the buttons of the beat-driven effects that are on flash with it, like the desktop chips.
  const pulse = useCallback(() => {
    const switches = latest.current
    if (!switches) return
    pulsingEffects(switches, EFFECT_KEYS).forEach((key) => {
      const button = buttons.current[key]
      if (button) flash.current(button)
    })
  }, [])

  if (!dial) return null
  const { effects, effectLabels, kaleidoscope, kaleidoscopeLabel, onToggleEffect, onToggleKaleidoscope, count, mode, onModeChange } = dial

  return (
    <div className='mobile-effects'>
      <div className='mobile-effects__top'>
        <KaleidoscopeDial {...dial} size={EFFECTS_DIAL_PX} chips={false} onBeat={pulse} />
        <div className='mobile-effects__side'>
          <div className='mobile-effects__count'>
            <span className='mobile-effects__count-name'>Kaleidoscope mirrors</span>
            <span className='mobile-effects__count-value' data-kaleidoscope-count>{count}</span>
          </div>
          <KaleidoscopeModes mode={mode} onModeChange={onModeChange} className='mobile-effects__modes' />
        </div>
      </div>
      <div className='mobile-effects__grid' role='group' aria-label='Effects'>
        {EFFECTS_TAB_EFFECTS.map((key) => (key === 'kaleidoscope'
          ? <EffectButton key={key} effect={key} label={kaleidoscopeLabel} on={kaleidoscope} onToggle={() => onToggleKaleidoscope(!kaleidoscope)} />
          : (
            <EffectButton
              key={key}
              effect={key}
              label={effectLabels[key]}
              on={effects[key]}
              onToggle={() => onToggleEffect(key, !effects[key])}
              buttonRef={(element) => { buttons.current[key] = element }}
            />
          )))}
      </div>
      <div className='mobile-effects__auto'>
        <AutoSwitch caption='follows the song until you take over' />
      </div>
    </div>
  )
}

/** The palettes as a sideways row, the range bar, Cycles, Phase and Saturation as one slider, then Reverse and Hard Edge. */
const ColorTab = (): React.ReactElement => {
  const { updateConfigItem } = useConfigContext()
  return (
    <div className='mobile-color'>
      <PalettePicker row />
      <PaletteRange />
      <OneSliderSection {...ONE_SLIDER_SETS.color} />
      <div className='config-checkbox-row mobile-color__pills'>
        <ConfigSectionItems name='color' only={COLOR_TAB_PILLS} onChange={updateConfigItem} />
      </div>
    </div>
  )
}

/** Sway as the large slider, then the desktop's camera pad. Speed, Rotation and Scale are gestures, so they are not here. */
const CameraTab = (): React.ReactElement => {
  const { updateConfigItem } = useConfigContext()
  const noSway = useConfigSelector(swayIsOff)
  return (
    <div className='mobile-camera' data-sway={noSway ? 'off' : 'on'}>
      <div className='sheet-slider'>
        <ConfigSectionItems name='user' only={CAMERA_TAB_SLIDERS} onChange={updateConfigItem} />
      </div>
      <div className='mobile-camera__row'>
        <div className='mobile-camera__pad'>
          <CameraTouchpad />
        </div>
        {/* The pad fades itself while Sway is 0; its caption fades with it, as Reverse Lean does on desktop. */}
        <p className='mobile-camera__info' style={{ opacity: noSway ? SWAY_OFF_OPACITY : 1 }}>
          {noSway
            ? 'Sway is 0, so the camera stays centered. Raise Sway to move it.'
            : 'Drag the pad to steer precisely, or just tap the visual. Its edges are as far as Sway lets the camera go.'}
        </p>
      </div>
    </div>
  )
}

export type ConfigMenuTab = 'effects' | 'color' | 'camera'

export const ConfigMenuTabBody = ({ tab }: { tab: ConfigMenuTab }): React.ReactElement | null => {
  switch (tab) {
  case 'effects':
    return <EffectsTab />
  case 'color':
    return <ColorTab />
  case 'camera':
    return <CameraTab />
  default:
    return null
  }
}
