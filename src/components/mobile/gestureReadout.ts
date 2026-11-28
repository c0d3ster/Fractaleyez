// What the mobile shell shows while a gesture is active, and when it goes away, kept free of the DOM so the timing can be tested
// with a fake clock. Full shows the desktop control in a panel near the top (it fades `PANEL_FADE_MS` after the fingers lift) and
// a one-line description at the bottom (held `INFO_HOLD_MS` after release, so it can be read once the hand is gone). Limited
// shows a label and number chip in the corner (`CHIP_FADE_MS`), with nothing for steering. None shows nothing. A new gesture
// during a fade or hold replaces what is up at once.

import type { GestureReadout as ReadoutStyle } from '../../config/mobileControls.config'
import type { ActiveGesture, ActiveGestureKind } from '../../input/touchController'
import type { Schedule } from './longPress'

export const PANEL_FADE_MS = 600
export const CHIP_FADE_MS = 1000
export const INFO_HOLD_MS = 2000

/** The bottom line in Full, one per gesture. */
export const GESTURE_INFO: Record<ActiveGestureKind, string> = {
  steer: 'Steer: drag one finger. Tap to point the camera there.',
  speed: 'Speed: two fingers up or down. Up is faster.',
  scale: 'Scale: pinch in or out.',
  rotation: 'Rotation: twist two fingers.',
  reset: 'Double-tap resets speed and rotation.',
}

export type GestureReadoutState = {
  /** The readout last shown ('full' panel or 'chip'), kept while it fades; null when nothing has shown since the last clear. */
  style: Exclude<ReadoutStyle, 'none'> | null
  /** The gesture it shows, kept while it fades. */
  kind: ActiveGestureKind | null
  /** False once the fade delay after release has passed (the element fades out with CSS, still showing `kind`). */
  visible: boolean
  /** The gesture whose description shows at the bottom (Full only), or null. */
  info: ActiveGestureKind | null
}

export const HIDDEN_READOUT: GestureReadoutState = { style: null, kind: null, visible: false, info: null }

/** Whether `style` has anything to show for `kind`: None never does, and the chip has no number for steering. */
export const showsReadout = (style: ReadoutStyle, kind: ActiveGestureKind): style is Exclude<ReadoutStyle, 'none'> =>
  style === 'full' || (style === 'chip' && kind !== 'steer')

const fadeDelay = (style: Exclude<ReadoutStyle, 'none'>): number => (style === 'full' ? PANEL_FADE_MS : CHIP_FADE_MS)

export type GestureReadoutMachine = {
  /** The gesture now published (null once the fingers lift) and the readout style of the active mode. */
  update: (gesture: ActiveGesture | null, style: ReadoutStyle) => void
  get: () => GestureReadoutState
  subscribe: (listener: () => void) => () => void
  /** Clears everything and cancels the timers. */
  clear: () => void
}

const defaultSchedule: Schedule = (fn, ms) => {
  const timer = setTimeout(fn, ms)
  return () => clearTimeout(timer)
}

export const createGestureReadout = (schedule: Schedule = defaultSchedule): GestureReadoutMachine => {
  let state = HIDDEN_READOUT
  let cancelFade: (() => void) | null = null
  let cancelInfo: (() => void) | null = null
  const listeners = new Set<() => void>()

  const set = (next: GestureReadoutState): void => {
    if (next.style === state.style && next.kind === state.kind && next.visible === state.visible && next.info === state.info) return
    state = next
    listeners.forEach((listener) => listener())
  }

  const stopTimers = (): void => {
    cancelFade?.()
    cancelInfo?.()
    cancelFade = null
    cancelInfo = null
  }

  return {
    update: (gesture, style) => {
      if (gesture) {
        stopTimers()
        // A gesture this mode shows nothing for still takes down whatever was fading, so an old value is never left up.
        set(showsReadout(style, gesture.kind)
          ? { style, kind: gesture.kind, visible: true, info: style === 'full' ? gesture.kind : null }
          : HIDDEN_READOUT)
        return
      }
      if (state.visible && state.style && !cancelFade) {
        cancelFade = schedule(() => {
          cancelFade = null
          set({ ...state, visible: false })
        }, fadeDelay(state.style))
      }
      if (state.info && !cancelInfo) {
        cancelInfo = schedule(() => {
          cancelInfo = null
          set({ ...state, info: null })
        }, INFO_HOLD_MS)
      }
    },
    get: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    clear: () => {
      stopTimers()
      set(HIDDEN_READOUT)
    },
  }
}

/** The number a readout shows: speed to one decimal, scale whole, rotation to one decimal with its sign. Empty for steer and reset. */
export const formatReadoutValue = (kind: ActiveGestureKind, value: number): string => {
  if (kind === 'speed') return value.toFixed(1)
  if (kind === 'scale') return String(Math.round(value))
  if (kind !== 'rotation') return ''
  // Rounded by size, so -1.25 reads -1.3 like 1.25 reads +1.3.
  const tenths = Math.sign(value) * Math.round(Math.abs(value) * 10)
  if (tenths === 0) return '0.0'
  return `${tenths > 0 ? '+' : '-'}${(Math.abs(tenths) / 10).toFixed(1)}`
}

/** Where `value` sits in `min..max`, as 0..1 (a bar's fill). */
export const fillFraction = (value: number, min: number, max: number): number =>
  max === min ? 0 : Math.max(0, Math.min(1, (value - min) / (max - min)))
