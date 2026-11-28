import { useSyncExternalStore } from 'react'

import { CONTROLS_MODE_DEFAULT, type ControlsMode } from '../../config/mobileControls.config'
import { readStoredControlsMode, writeStoredControlsMode } from '../../utils/storedControlsMode'

// The one source of the active on-screen controls mode, for code outside React (window.getControlsMode) and inside
// (useControlsMode). ConfigProvider sets it from the user settings; it starts from the mode last used in this browser.
let mode: ControlsMode = readStoredControlsMode() ?? CONTROLS_MODE_DEFAULT
const listeners = new Set<() => void>()

export const getControlsMode = (): ControlsMode => mode

/** Applies `next` and remembers it in this browser (see storedControlsMode). */
export const setControlsMode = (next: ControlsMode): void => {
  writeStoredControlsMode(next)
  if (next === mode) return
  mode = next
  listeners.forEach((listener) => listener())
}

export const subscribeControlsMode = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const useControlsMode = (): ControlsMode => useSyncExternalStore(subscribeControlsMode, getControlsMode, getControlsMode)
