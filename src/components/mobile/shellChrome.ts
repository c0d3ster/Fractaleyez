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

export type ChromeRect = { left: number; top: number; right: number; bottom: number }

/** A bar or badge as the wake guard sees it: its state and where it is on screen. */
export type ChromeTarget = { state: BarState | BadgeState; rect: ChromeRect }

const inside = (point: { x: number; y: number }, rect: ChromeRect): boolean =>
  point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom

/** Whether a touch at `point` only wakes the chrome: it lands on a bar or badge that has faded while idle. Such a touch brings them back and does nothing else (no steering, no toggle, no gesture). A touch on a shown, dimmed or slid-away element, or on the open visual, is not taken. */
export const wakesOnly = (point: { x: number; y: number }, targets: readonly ChromeTarget[]): boolean =>
  targets.some((target) => target.state === 'faded' && inside(point, target.rect))

export type WakeGuard = {
  /** A finger landed. Returns true when the touch is taken: the caller stops it reaching the visual and the controls. */
  down: (id: number, point: { x: number; y: number }, targets: readonly ChromeTarget[]) => boolean
  /** Whether a later event of pointer `id` (move, up, cancel) belongs to a taken touch, so it is stopped too. */
  owns: (id: number) => boolean
  /** The finger lifted or was cancelled. */
  end: (id: number) => void
}

/** Tracks the touches `wakesOnly` takes, from the press to the lift. */
export const createWakeGuard = (): WakeGuard => {
  const taken = new Set<number>()
  return {
    down: (id, point, targets) => {
      if (!wakesOnly(point, targets)) return false
      taken.add(id)
      return true
    },
    owns: (id) => taken.has(id),
    end: (id) => {
      taken.delete(id)
    },
  }
}
