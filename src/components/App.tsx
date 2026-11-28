import React, { useState, useEffect, useCallback } from 'react'
import '../styles/base.css'
import '../styles/tailwind.css'
import '../styles/App.css'

import { initWithMicrophone } from '../main'
import { ConfigWindow } from './config/ConfigWindow'
import { Sidebar } from './sidebar/Sidebar'
import { TopBar } from './topbar/TopBar'
import { UpgradeProvider } from './upgrade/UpgradeProvider'
import { MobileShell } from './mobile'
import { useMobileShell } from '../utils/useMobileShell'

const AppInner = (): React.ReactElement => {
  const [configWindowVisible, setConfigWindowVisible] = useState(false)
  const mobileShell = useMobileShell()

  useEffect(() => {
    initWithMicrophone()
  }, [])

  const toggleConfigWindow = useCallback(() => {
    setConfigWindowVisible((prev) => !prev)
  }, [])

  return (
    <UpgradeProvider>
      <div>
        {/* On a phone the shell's bar and badge replace the sidebar and the top bar, and the pop-out window is not offered. */}
        {mobileShell ? <MobileShell /> : (
          <>
            {configWindowVisible && <ConfigWindow onClose={toggleConfigWindow} />}
            <Sidebar
              setConfigWindow={toggleConfigWindow}
              configWindowVisible={configWindowVisible} />
            <TopBar />
          </>
        )}
      </div>
    </UpgradeProvider>
  )
}

export const App = AppInner
