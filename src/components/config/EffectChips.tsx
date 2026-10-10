import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { EFFECT_KEYS, EffectKey, MotionEffects } from './useGalaxyMotion'
import './EffectChips.css'

export type EffectChipsHandle = {
  /** Flashes the chips of the effects that fire on a beat and are on. */
  pulse: () => void
}

type EffectChipsProps = {
  effects: MotionEffects
  labels: Readonly<Record<EffectKey, string>>
  onToggle: (key: EffectKey, enabled: boolean) => void
  /** The kaleidoscope leads the row: it changes the whole picture and is the one effect with an amount (the dial's knob). */
  kaleidoscope: boolean
  kaleidoscopeLabel: string
  kaleidoscopeCount: number
  onToggleKaleidoscope: (enabled: boolean) => void
}

// Cyclone just turns, so it only lights up; the rest act on a beat, so they flash with it.
const BEAT_DRIVEN: ReadonlySet<EffectKey> = new Set<EffectKey>(['wobWob', 'switcheroo', 'colorShift', 'glow', 'shockwave'])

// Shown on hover with the effect's name, since the chips replace checkboxes that had nothing but a name to go on.
const DESCRIPTIONS: Readonly<Record<EffectKey, string>> = {
  cyclone: 'Particle layers spin in alternating directions.',
  wobWob: 'On each beat, particles are pushed back, so the scene surges toward and away from you.',
  switcheroo: 'On each beat, every other layer reshapes itself.',
  colorShift: 'On each beat, the colors are re-rolled.',
  glow: 'Bloom swells with the energy of each beat.',
  shockwave: 'A ring bursts out from the center on a loud beat.',
}

const KALEIDOSCOPE_DESCRIPTION = 'Mirrors the picture around the center. Drag the dial to choose how many mirrors.'

const PULSE_MS = 280
const PULSE_KEYFRAMES: Keyframe[] = [
  { transform: 'scale(1)', filter: 'brightness(1)' },
  { transform: 'scale(1.1)', filter: 'brightness(1.6)', offset: 0.25 },
  { transform: 'scale(1)', filter: 'brightness(1)' },
]

/**
 * The Effects as a set of switches, the kaleidoscope first on a row of its own: each lights up when its effect is on,
 * and flashes on a beat when it is acting.
 * Together with the galaxy above them they show what the effects are doing and let you turn them on and off.
 */
export const EffectChips = React.memo(forwardRef<EffectChipsHandle, EffectChipsProps>(({ effects, labels, onToggle, kaleidoscope, kaleidoscopeLabel, kaleidoscopeCount, onToggleKaleidoscope }, ref): React.ReactElement => {
  const chips = useRef<Partial<Record<EffectKey, HTMLButtonElement | null>>>({})
  // The flash reads the latest settings from here, so a beat never has to wait for a re-render.
  const latest = useRef(effects)

  useEffect(() => {
    latest.current = effects
  })

  useImperativeHandle(ref, () => ({
    pulse: (): void => {
      EFFECT_KEYS.forEach((key) => {
        if (!latest.current[key] || !BEAT_DRIVEN.has(key)) return
        chips.current[key]?.animate(PULSE_KEYFRAMES, { duration: PULSE_MS, easing: 'ease-out' })
      })
    },
  }), [])

  return (
    <div className='effect-chips-box'>
      <div className='effect-chips' role='group' aria-label='Effects'>
        <button
          type='button'
          id='kaleidoscope'
          className={`effect-chip effect-chip--lead${kaleidoscope ? ' effect-chip--on' : ''}`}
          title={`${kaleidoscopeLabel}: ${KALEIDOSCOPE_DESCRIPTION}`}
          aria-pressed={kaleidoscope}
          onClick={() => onToggleKaleidoscope(!kaleidoscope)}
        >
          {kaleidoscopeLabel} · {kaleidoscopeCount}
        </button>
        {EFFECT_KEYS.map((key) => (
          <button
            key={key}
            ref={(element) => { chips.current[key] = element }}
            type='button'
            id={key}
            className={`effect-chip${effects[key] ? ' effect-chip--on' : ''}`}
            title={`${labels[key]}: ${DESCRIPTIONS[key]}`}
            aria-pressed={effects[key]}
            onClick={() => onToggle(key, !effects[key])}
          >
            {labels[key]}
          </button>
        ))}
      </div>
    </div>
  )
}))
