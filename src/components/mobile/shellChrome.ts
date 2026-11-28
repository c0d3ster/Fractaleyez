import { CONTROLS_FADE_MS, type ControlsVisibility } from '../../config/mobileControls.config'
import type { Schedule } from './longPress'

// What the mobile shell's bottom bar and account badge show, kept free of the DOM so it can be tested with a fake clock.

/** shown: at rest. faded: idle in Full (transparent, touches pass through to the visual). away: slid off for a gesture or Full's info line. dim: the badge during a gesture. off: not rendered in this mode. */
export type BarState = 'shown' | 'faded' | 'away' | 'off'
export type BadgeState = 'shown' | 'faded' | 'dim' | 'off'

export type ChromeInputs = {
  visibility: ControlsVisibility
  /** No touch for CONTROLS_FADE_MS. */
  idle: boolean
  /** A gesture is being published by the touch controller. */
  gestureActive: boolean
  /** Full's one-line gesture description is showing where the bar sits. */
  infoActive: boolean
}

export const barState = ({ visibility, idle, gestureActive, infoActive }: ChromeInputs): BarState => {
  if (!visibility.bar) return 'off'
  if (gestureActive || infoActive) return 'away'
  if (visibility.fadeWhenIdle && idle) return 'faded'
  return 'shown'
}

export const badgeState = ({ visibility, idle, gestureActive }: ChromeInputs): BadgeState => {
  if (!visibility.badge) return 'off'
  // The badge stays put during a gesture, dimmed, opposite the readout (docs/mobile-design/TopCGesture.html).
  if (gestureActive) return 'dim'
  if (visibility.fadeWhenIdle && idle) return 'faded'
  return 'shown'
}

export type IdleFade = {
  /** A touch: not idle, and the countdown starts again. */
  touch: () => void
  isIdle: () => boolean
  subscribe: (listener: () => void) => () => void
  stop: () => void
}

const defaultSchedule: Schedule = (fn, ms) => {
  const timer = setTimeout(fn, ms)
  return () => clearTimeout(timer)
}

/** Turns idle `ms` after the last touch (and `ms` after it starts). */
export const createIdleFade = (schedule: Schedule = defaultSchedule, ms = CONTROLS_FADE_MS): IdleFade => {
  const listeners = new Set<() => void>()
  let idle = false
  let cancel: (() => void) | null = null

  const set = (next: boolean): void => {
    if (next === idle) return
    idle = next
    listeners.forEach((listener) => listener())
  }
  const arm = (): void => {
    cancel?.()
    cancel = schedule(() => {
      cancel = null
      set(true)
    }, ms)
  }
  arm()

  return {
    touch: () => {
      set(false)
      arm()
    },
    isIdle: () => idle,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    stop: () => {
      cancel?.()
      cancel = null
      listeners.clear()
    },
  }
}
