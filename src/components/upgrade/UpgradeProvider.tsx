import React, { useCallback, useContext, useMemo, useState } from 'react'
import { UpgradeModal } from './UpgradeModal'

type UpgradeContextValue = {
  /** Opens the upgrade prompt: the plan tiers with their Checkout buttons, or a sign-in for a guest. `reason` says what was locked. */
  requestUpgrade: (reason?: string) => void
}

const UpgradeContext = React.createContext<UpgradeContextValue | undefined>(undefined)

/** Outside a provider (a test, or a tree without one) the request is a no-op, so a lock never throws. */
export const useUpgrade = (): UpgradeContextValue => useContext(UpgradeContext) ?? { requestUpgrade: (): void => undefined }

export const UpgradeProvider = ({ children }: { children: React.ReactNode }): React.ReactElement => {
  // undefined is closed; a string (possibly empty) is open with that reason.
  const [reason, setReason] = useState<string | undefined>(undefined)

  const requestUpgrade = useCallback((why?: string): void => {
    setReason(why ?? '')
    // The prompt draws in the main window, so a request from the popped-out config window brings it forward.
    window.focus()
  }, [])
  const close = useCallback((): void => setReason(undefined), [])
  const value = useMemo(() => ({ requestUpgrade }), [requestUpgrade])

  return (
    <UpgradeContext.Provider value={value}>
      {children}
      {reason !== undefined ? <UpgradeModal reason={reason} onClose={close} /> : null}
    </UpgradeContext.Provider>
  )
}
