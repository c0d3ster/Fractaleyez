import { useCallback, useSyncExternalStore } from 'react'

import { ghostStore, GhostValue } from '../../../utils/ghostStore'

/** The ghost under a key (see `ghostStore`), re-rendering only when that one value changes. No key means no ghost. */
export const useGhost = (key: string | undefined): GhostValue | null => {
  const getSnapshot = useCallback((): GhostValue | null => (key === undefined ? null : ghostStore.get(key)), [key])
  return useSyncExternalStore(ghostStore.subscribe, getSnapshot)
}
