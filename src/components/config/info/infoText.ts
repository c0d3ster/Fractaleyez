import { useSyncExternalStore } from 'react'

// Info text set from code rather than by hovering a control: the mobile shell's line at the bottom of the screen, which describes
// the gesture in progress (there is nothing to hover on a phone). One line at a time; null means none.
let text: string | null = null
const listeners = new Set<() => void>()

export const getInfoText = (): string | null => text

export const setInfoText = (next: string | null): void => {
  if (next === text) return
  text = next
  listeners.forEach((listener) => listener())
}

export const subscribeInfoText = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const useInfoText = (): string | null => useSyncExternalStore(subscribeInfoText, getInfoText, getInfoText)
