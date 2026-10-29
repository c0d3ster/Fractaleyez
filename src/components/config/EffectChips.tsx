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
  /** Flashes in a few steps, so the popup only has a new frame to draw when one changes. */
  stepped: boolean
  onToggle: (key: EffectKey, enabled: boolean) => void
  /** The kaleidoscope leads the row: it changes the whole picture and is the one effect with an amount (the dial's knob). */
  kaleidoscope: boolean
  kaleidoscopeLabel: string
  kaleidoscopeCount: number
  mode: number
  onModeChange: (mode: number) => void
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

// The kaleidoscope's modes, in the order of the stored value: each button's icon is a dotted line (or circle) for the mirror axis.
const MODES: readonly { label: string, description: string, icon: React.ReactElement }[] = [
  { label: 'Radial', description: 'Mirrors around the center in wedges.', icon: <circle cx='12' cy='12' r='8' /> },
  { label: 'Horizontal', description: 'Stacks mirrored strips, each flipped over the last.', icon: <line x1='3' y1='12' x2='21' y2='12' /> },
  { label: 'Vertical', description: 'Puts mirrored strips side by side, each flipped over the last.', icon: <line x1='12' y1='3' x2='12' y2='21' /> },
]

const PULSE_MS = 280
const PULSE_STEPS = 4
const PULSE_SCALE_KEYFRAMES: Keyframe[] = [
  { transform: 'scale(1)' },
  { transform: 'scale(1.1)', offset: 0.25 },
  { transform: 'scale(1)' },
]
// The brightening is a white overlay (the chip's ::after) fading in and out.
const PULSE_FLASH_KEYFRAMES: Keyframe[] = [
  { opacity: 0 },
  { opacity: 0.3, offset: 0.25 },
  { opacity: 0 },
]

/**
 * The Effects as a set of switches, the kaleidoscope first on a row of its own: each lights up when its effect is on,
 * and flashes on a beat when it is acting.
 * Together with the galaxy above them they show what the effects are doing and let you turn them on and off.
 */
export const EffectChips = React.memo(forwardRef<EffectChipsHandle, EffectChipsProps>(({ effects, labels, stepped, onToggle, kaleidoscope, kaleidoscopeLabel, kaleidoscopeCount, mode, onModeChange, onToggleKaleidoscope }, ref): React.ReactElement => {
  const chips = useRef<Partial<Record<EffectKey, HTMLButtonElement | null>>>({})
  // Built the first time a chip flashes and replayed after that; making new animations on every beat is what costs.
  const flashes = useRef<Partial<Record<EffectKey, Animation[]>>>({})
  // The flash reads the latest settings from here, so a beat never has to wait for a re-render.
  const latest = useRef(effects)

  useEffect(() => {
    latest.current = effects
  })

  // The flashes are built with their easing, so a change to or from stepped builds them again.
  useEffect(() => () => {
    Object.values(flashes.current).forEach((animations) => animations.forEach((animation) => animation.cancel()))
    flashes.current = {}
  }, [stepped])

  useImperativeHandle(ref, () => ({
    pulse: (): void => {
      const easing = stepped ? `steps(${PULSE_STEPS})` : 'ease-out'
      EFFECT_KEYS.forEach((key) => {
        if (!latest.current[key] || !BEAT_DRIVEN.has(key)) return
        const chip = chips.current[key]
        if (!chip) return
        const animations = flashes.current[key] ?? [
          chip.animate(PULSE_SCALE_KEYFRAMES, { duration: PULSE_MS, easing }),
          chip.animate(PULSE_FLASH_KEYFRAMES, { duration: PULSE_MS, easing, pseudoElement: '::after' }),
        ]
        flashes.current[key] = animations
        animations.forEach((animation) => {
          animation.currentTime = 0
          animation.play()
        })
      })
    },
  }), [stepped])

  return (
    <div className='effect-chips-box'>
      <div className='kaleidoscope-modes' role='group' aria-label='Kaleidoscope mode'>
        {MODES.map(({ label, description, icon }, index) => (
          <button
            key={label}
            type='button'
            className={`kaleidoscope-mode${mode === index ? ' kaleidoscope-mode--on' : ''}`}
            title={`${label}: ${description}`}
            aria-label={label}
            aria-pressed={mode === index}
            onClick={() => onModeChange(index)}
          >
            <svg viewBox='0 0 24 24' aria-hidden='true' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeDasharray='0.1 4'>
              {icon}
            </svg>
          </button>
        ))}
      </div>
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
