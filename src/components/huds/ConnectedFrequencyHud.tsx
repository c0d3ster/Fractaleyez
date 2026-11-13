import React, { useCallback, useEffect, useRef, useState } from 'react'
import { DEFAULT_ENABLED_BANDS, ONSET_BANDS, isValidBandSelection } from 'beatsense'
import { FrequencyHud } from 'beatsense-ui'

import { useConfigContext } from '../config/context/ConfigProvider'

const VISIBLE_BANDS = ONSET_BANDS.length

/** The Frequency HUD with its band toggles wired to the user's saved settings and to window.enabledFreqBands, which the beat detector reads. */
export const ConnectedFrequencyHud = (): React.ReactElement => {
  const { userSettings, updateUserSettings } = useConfigContext()
  // Persisted settings (loaded async from /api/me) take priority once they arrive; until then,
  // fall back to whatever the live global already holds (e.g. from an earlier session tab).
  const [enabledBands, setEnabledBands] = useState<boolean[]>(() =>
    (userSettings?.hud?.enabledFreqBands ?? window.enabledFreqBands ?? DEFAULT_ENABLED_BANDS).slice(0, VISIBLE_BANDS)
  )
  const appliedPersistedRef = useRef(false)

  // One-time sync once the persisted setting actually loads (it arrives after this component's
  // initial mount, since /api/me is fetched async) -- doesn't refire on every settings patch,
  // otherwise a locally-driven toggle below would get overwritten by its own stale closure.
  useEffect(() => {
    if (appliedPersistedRef.current) return
    const persisted = userSettings?.hud?.enabledFreqBands
    if (!persisted || !isValidBandSelection(persisted)) return
    appliedPersistedRef.current = true
    setEnabledBands(persisted.slice(0, VISIBLE_BANDS))
  }, [userSettings])

  const handleEnabledBandsChange = useCallback((next: boolean[]): void => {
    setEnabledBands(next)
    // Sync to global: visible bands toggle, hidden high bands stay false
    const live = window.enabledFreqBands
    if (live) next.forEach((on, idx) => { live[idx] = on })
    updateUserSettings({ hud: { enabledFreqBands: next } })
  }, [updateUserSettings])

  return <FrequencyHud enabledBands={enabledBands} onEnabledBandsChange={handleEnabledBandsChange} />
}
