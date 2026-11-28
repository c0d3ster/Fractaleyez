import type { SoundHint } from './audio-lifecycle'

// The mobile sound hint, written by the audio lifecycle in main.ts and read by the SoundHint line in the React tree.
let current: SoundHint = null
const listeners = new Set<() => void>()

export const soundHint = {
  get: (): SoundHint => current,
  set: (hint: SoundHint): void => {
    if (hint === current) return
    current = hint
    listeners.forEach((listener) => listener())
  },
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}
