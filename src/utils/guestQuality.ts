import { isQualitySetting, type QualitySetting } from '../config/quality.config'

// A signed-out viewer's quality setting, kept in this browser. Signed in, the account's setting is used instead (or Auto when it has
// none), so this only applies while signed out. It is left in place on sign-in, so signing out again goes back to it.
const GUEST_QUALITY_KEY = 'guestQuality'

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

// Storage can throw on access (disabled, private window), so even looking it up is guarded.
const defaultStorage = (): StorageLike | undefined => {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

/** The guest's saved setting, or null when there is none (or it is not a setting this build knows). */
export const readGuestQuality = (storage: StorageLike | undefined = defaultStorage()): QualitySetting | null => {
  try {
    const value = storage?.getItem(GUEST_QUALITY_KEY) ?? null
    return isQualitySetting(value) ? value : null
  } catch {
    return null
  }
}

export const writeGuestQuality = (setting: QualitySetting, storage: StorageLike | undefined = defaultStorage()): void => {
  try {
    storage?.setItem(GUEST_QUALITY_KEY, setting)
  } catch {
    // Blocked storage: the setting still applies for this visit, it is just not remembered.
  }
}
