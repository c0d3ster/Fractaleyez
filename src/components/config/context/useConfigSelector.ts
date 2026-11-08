import { useMemo, useSyncExternalStore } from 'react'

import { AppConfig, configDefaults } from '../../../config/configDefaults'
import { ConfigStore, readSelector } from './configStore'

/** The page's one config store. `ConfigProvider` publishes to it; the pop-out window is rendered by the same React, so it reads this same store. */
export const configStore = new ConfigStore(structuredClone(configDefaults))

/**
 * Reads a slice of the live config and re-renders only when that slice changes. Pick the section, or the few values, the component draws:
 * `useConfigSelector((config) => config.user)`. A selector that builds a new object (several slices together) needs `shallowEqual` as
 * `isEqual`, or it would look changed on every read. The selector may close over props; it is read again whenever it changes.
 */
export const useConfigSelector = <T>(select: (config: AppConfig) => T, isEqual?: (a: T, b: T) => boolean): T => {
  const reader = useMemo(() => readSelector(configStore, select, isEqual), [select, isEqual])
  return useSyncExternalStore(reader.subscribe, reader.getSnapshot)
}
