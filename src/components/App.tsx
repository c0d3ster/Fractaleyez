import React, { useState, useEffect, useCallback } from 'react'
import '../styles/base.css'
import '../styles/tailwind.css'
import '../styles/App.css'

import { initWithMicrophone } from '../main'
import { ConfigWindow } from './config/ConfigWindow'
import { Sidebar } from './sidebar/Sidebar'
import { TopBar } from './topbar/TopBar'
import { ListenRecorderBridge } from './settings/ListenRecorderBridge'

const AppInner = (): React.ReactElement => {
  const [configWindowVisible, setConfigWindowVisible] = useState(false)

  useEffect(() => {
    initWithMicrophone()
  }, [])

  const toggleConfigWindow = useCallback(() => {
    setConfigWindowVisible((prev) => !prev)
  }, [])

  return (
    <div>
      {configWindowVisible && <ConfigWindow onClose={toggleConfigWindow} />}
      <Sidebar
        setConfigWindow={toggleConfigWindow}
        configWindowVisible={configWindowVisible} />
      <TopBar />
      <ListenRecorderBridge />
    </div>
  )
}

export const App = AppInner
