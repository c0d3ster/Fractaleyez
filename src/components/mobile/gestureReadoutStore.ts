import { useSyncExternalStore } from 'react'

import { controlsVisibility } from '../../config/mobileControls.config'
import { getGesture, subscribeGesture } from '../../input/touchController'
import { setInfoText } from '../config/info/infoText'
import { getControlsMode, subscribeControlsMode } from './controlsMode'
import { createGestureReadout, GESTURE_INFO, GestureReadoutState } from './gestureReadout'
import { isMenuOpen, subscribeMenuOpen } from './menuBus'

// The app's one gesture readout: the timing in gestureReadout.ts fed by the touch controller's published gesture and the active
// on-screen controls mode. It listens only while something reads it (GestureReadout, and the bottom bar through
// useGestureInfoActive), and it writes Full's bottom line into the programmatic info text.
const machine = createGestureReadout()
const listeners = new Set<() => void>()
let stop: (() => void) | null = null

const sync = (): void => machine.update(getGesture(), controlsVisibility(getControlsMode(), isMenuOpen()).readout)

const start = (): (() => void) => {
  const unsubscribers = [
    subscribeGesture(sync),
    subscribeControlsMode(sync),
    subscribeMenuOpen(sync),
    machine.subscribe(() => {
      const { info } = machine.get()
      setInfoText(info ? GESTURE_INFO[info] : null)
      listeners.forEach((listener) => listener())
    }),
  ]
  sync()
  return () => {
    unsubscribers.forEach((unsubscribe) => unsubscribe())
    machine.clear()
    setInfoText(null)
  }
}

export const getGestureReadout = (): GestureReadoutState => machine.get()

export const subscribeGestureReadout = (listener: () => void): (() => void) => {
  listeners.add(listener)
  if (!stop) stop = start()
  return () => {
    listeners.delete(listener)
    if (listeners.size > 0 || !stop) return
    stop()
    stop = null
  }
}

export const useGestureReadout = (): GestureReadoutState =>
  useSyncExternalStore(subscribeGestureReadout, getGestureReadout, getGestureReadout)

const infoActive = (): boolean => machine.get().info !== null

/** True while Full's one-line gesture description shows at the bottom (during a gesture and for INFO_HOLD_MS after it), so the bottom bar can step aside. */
export const useGestureInfoActive = (): boolean => useSyncExternalStore(subscribeGestureReadout, infoActive, infoActive)
