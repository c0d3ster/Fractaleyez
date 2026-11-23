import { defaultDrumThresholds, type DrumKind } from 'beatsense'

import { isDrumThresholds } from './recording/thresholdLog'

const KEY = 'beatsense-lab.drumThresholds'

/** The drum thresholds the lab's sliders were last left at in this browser, or the model's (nothing saved, or storage blocked). */
export const loadDrumThresholds = (): Record<DrumKind, number> => {
  try {
    const text = window.localStorage.getItem(KEY)
    const saved: unknown = text === null ? null : JSON.parse(text)
    return isDrumThresholds(saved) ? { ...saved } : defaultDrumThresholds()
  } catch {
    return defaultDrumThresholds()
  }
}

/** Keeps the sliders' thresholds for the next visit; a browser that blocks storage just starts at the model's again. */
export const saveDrumThresholds = (thresholds: Readonly<Record<DrumKind, number>>): void => {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(thresholds))
  } catch {
    // Storage blocked or full: nothing to keep.
  }
}
