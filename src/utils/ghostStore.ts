/** What a ghost can say about a control: a slider's position, or whether a switch is on. */
export type GhostValue = number | boolean

type Listener = () => void

/** The key a control is known by: its config section and item, such as `effects.kaleidoscope`. */
export const ghostKey = (category: string, item: string): string => `${category}.${item}`

/**
 * Where something other than the user (Auto mode, a Switcheroo hop on the Tour) has a control right now, kept apart from
 * the config. The config holds what the user chose and the preset stores; a ghost is only shown beside it, so nothing here
 * is ever saved, and clearing a ghost leaves the config exactly as it was. A control reads the ghost under its own key and
 * is woken only when that value changes.
 */
export class GhostStore {
  private readonly values = new Map<string, GhostValue>()
  private readonly listeners = new Set<Listener>()

  get = (key: string): GhostValue | null => this.values.get(key) ?? null

  /** Sets a ghost, or removes it with null. Saying the same thing again wakes nobody, so this is safe to call every frame. */
  set = (key: string, value: GhostValue | null): void => {
    if (value === null) {
      if (!this.values.delete(key)) return
    } else {
      if (this.values.get(key) === value) return
      this.values.set(key, value)
    }
    this.notify()
  }

  /** Removes every ghost whose key starts with the prefix (`effects.` for the whole Effects section), or all of them with none. */
  clear = (prefix = ''): void => {
    const keys = [...this.values.keys()].filter((key) => key.startsWith(prefix))
    if (keys.length === 0) return
    keys.forEach((key) => this.values.delete(key))
    this.notify()
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private notify = (): void => {
    // A listener that unsubscribes while being called must not break the walk.
    ;[...this.listeners].forEach((listener) => listener())
  }
}

/** The page's one ghost store. The pop-out config window is rendered by the same React, so it reads this same store. */
export const ghostStore = new GhostStore()

/** How a switch's ghost differs from what it shows: `on` is a switch that is off but wanted on, `off` one that is on but wanted off. */
export type SwitchGhost = 'on' | 'off'

export const switchGhost = (ghost: GhostValue | null, checked: boolean): SwitchGhost | null => {
  if (typeof ghost !== 'boolean' || ghost === checked) return null
  return ghost ? 'on' : 'off'
}

/** Where a slider's ghost sits as a 0..1 fraction of its track, or null when there is none or it is where the slider already is. */
export const sliderGhostFraction = (ghost: GhostValue | null, value: number, min: number, max: number): number | null => {
  if (typeof ghost !== 'number' || ghost === value || max <= min) return null
  return Math.max(0, Math.min(1, (ghost - min) / (max - min)))
}
