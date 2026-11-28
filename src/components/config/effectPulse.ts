import type { EffectKey, MotionEffects } from './useGalaxyMotion'

// The flash an effect's switch gives on a beat, shared by the desktop chips (EffectChips) and the mobile bar's effect buttons
// (BottomBar). The element needs a `::after` overlay (white, opacity 0, inset 0) for the brightening; the scale runs on the
// element itself. Both run off the main thread, which a brightness filter does not.

// Cyclone just turns, so it only lights up; the rest act on a beat, so they flash with it.
export const BEAT_DRIVEN: ReadonlySet<EffectKey> = new Set<EffectKey>(['wobWob', 'switcheroo', 'colorShift', 'glow', 'shockwave'])

/** The effects whose switch flashes on a beat: those that are on and act on a beat. */
export const pulsingEffects = (effects: MotionEffects, keys: readonly EffectKey[]): EffectKey[] =>
  keys.filter((key) => effects[key] && BEAT_DRIVEN.has(key))

export const PULSE_MS = 280
// In a few steps, so the popup only has a new frame to draw when one changes.
const PULSE_EASING = 'steps(4)'
const PULSE_SCALE_KEYFRAMES: Keyframe[] = [
  { transform: 'scale(1)' },
  { transform: 'scale(1.1)', offset: 0.25 },
  { transform: 'scale(1)' },
]
const PULSE_FLASH_KEYFRAMES: Keyframe[] = [
  { opacity: 0 },
  { opacity: 0.3, offset: 0.25 },
  { opacity: 0 },
]

/**
 * Returns a function that flashes an element once. The animations are built the first time an element flashes and replayed after
 * that; making new animations on every beat is what costs.
 */
export const createPulse = (): ((element: HTMLElement) => void) => {
  const built = new WeakMap<HTMLElement, Animation[]>()
  return (element) => {
    const animations = built.get(element) ?? [
      element.animate(PULSE_SCALE_KEYFRAMES, { duration: PULSE_MS, easing: PULSE_EASING }),
      element.animate(PULSE_FLASH_KEYFRAMES, { duration: PULSE_MS, easing: PULSE_EASING, pseudoElement: '::after' }),
    ]
    built.set(element, animations)
    animations.forEach((animation) => {
      animation.currentTime = 0
      animation.play()
    })
  }
}
