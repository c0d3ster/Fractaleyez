import React, { Suspense, lazy, useState, useCallback, useEffect } from 'react'
import '../styles/base.css'
import '../styles/tailwind.css'
import '../styles/App.css'

import { afterStartup } from '../utils/afterStartup'
import { Sidebar } from './sidebar/Sidebar'
import { TopBar } from './topbar/TopBar'
import { UpgradeProvider } from './upgrade/UpgradeProvider'
import { startupTimeline } from '../visualization/perf/startup'

// The expanded config window is a chunk of its own, fetched in idle time after startup so it opens without a wait.
const loadConfigWindow = (): Promise<{ default: typeof import('./config/ConfigWindow').ConfigWindow }> =>
  import(/* webpackChunkName: "config-window" */ './config/ConfigWindow').then((module) => ({ default: module.ConfigWindow }))
const ConfigWindow = lazy(loadConfigWindow)
void afterStartup().then(loadConfigWindow)

const AppInner = (): React.ReactElement => {
  const [configWindowVisible, setConfigWindowVisible] = useState(false)

  // The UI's first commit, for the startup timeline.
  useEffect(() => startupTimeline.mark('ui'), [])

  const toggleConfigWindow = useCallback(() => {
    setConfigWindowVisible((prev) => !prev)
  }, [])

  return (
    <UpgradeProvider>
      <div>
        {configWindowVisible && <Suspense fallback={null}><ConfigWindow onClose={toggleConfigWindow} /></Suspense>}
        <Sidebar
          setConfigWindow={toggleConfigWindow}
          configWindowVisible={configWindowVisible} />
        <TopBar />
      </div>
    </UpgradeProvider>
  )
}

export const App = AppInner
