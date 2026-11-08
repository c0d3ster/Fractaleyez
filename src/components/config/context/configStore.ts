import { AppConfig } from '../../../config/configDefaults'

type Listener = () => void

/**
 * The live config as an external store, so a component can subscribe to the slice it reads instead of re-rendering on every change.
 * `ConfigProvider` owns the config and publishes each new value here after it commits; everything in the page (and the pop-out window,
 * which is rendered by the same React) reads it through `useConfigSelector`. A config change replaces only the sections it touches, so a
 * slice that did not change keeps its identity and its subscribers are not woken.
 */
export class ConfigStore {
  private current: AppConfig
  private readonly listeners = new Set<Listener>()

  constructor(initial: AppConfig) {
    this.current = initial
  }

  get = (): AppConfig => this.current

  set = (next: AppConfig): void => {
    if (next === this.current) return
    this.current = next
    // A listener that unsubscribes while being called must not break the walk.
    ;[...this.listeners].forEach((listener) => listener())
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
}

export type SelectorReader<T> = {
  subscribe: (listener: Listener) => () => void
  getSnapshot: () => T
}

/**
 * A snapshot reader for `useSyncExternalStore` that only changes its answer when the selected value really changes. React needs
 * `getSnapshot` to return the same value while nothing changed, so a selector that builds a new object each call (a few slices
 * picked together) is held to its last result as long as `isEqual` says the pieces are the same.
 */
export const readSelector = <T>(store: ConfigStore, select: (config: AppConfig) => T, isEqual: (a: T, b: T) => boolean = Object.is): SelectorReader<T> => {
  let lastConfig: AppConfig | null = null
  let lastSelected: T
  return {
    subscribe: store.subscribe,
    getSnapshot: () => {
      const config = store.get()
      if (config === lastConfig) return lastSelected
      const next = select(config)
      const keep = lastConfig !== null && isEqual(lastSelected, next)
      lastConfig = config
      if (!keep) lastSelected = next
      return lastSelected
    },
  }
}

/** True when both objects hold the same values under the same keys (one level deep): the equality for a selector that picks several slices. */
export const shallowEqual = <T extends object>(a: T, b: T): boolean => {
  if (a === b) return true
  const keys = Object.keys(a) as Array<keyof T>
  return keys.length === Object.keys(b).length && keys.every((key) => Object.is(a[key], b[key]))
}
