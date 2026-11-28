import { isControlsMode, type ControlsMode } from '../config/mobileControls.config'

// The last on-screen controls mode used in this browser: a guest's own pick, or the signed-in account's setting. Unlike
// guestQuality it is also written while signed in, so the mode applies from the first frame, before sign-in resolves (a None
// user never sees the bar flash in). Signed in, the account's setting replaces it once /api/me loads.
const STORED_CONTROLS_MODE_KEY = 'onScreenControls'

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

// Storage can throw on access (disabled, private window), so even looking it up is guarded.
const defaultStorage = (): StorageLike | undefined => {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

/** The stored mode, or null when there is none (or it is not a mode this build knows). */
export const readStoredControlsMode = (storage: StorageLike | undefined = defaultStorage()): ControlsMode | null => {
  try {
    const value = storage?.getItem(STORED_CONTROLS_MODE_KEY) ?? null
    return isControlsMode(value) ? value : null
  } catch {
    return null
  }
}

export const writeStoredControlsMode = (mode: ControlsMode, storage: StorageLike | undefined = defaultStorage()): void => {
  try {
    storage?.setItem(STORED_CONTROLS_MODE_KEY, mode)
  } catch {
    // Blocked storage: the mode still applies for this visit, it is just not remembered.
  }
}
