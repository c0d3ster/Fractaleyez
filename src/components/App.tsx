import React, { useState, useEffect, useCallback } from 'react'
import '../styles/App.css'
import 'bootstrap/dist/css/bootstrap.min.css'

import { initWithMicrophone } from '../main'
import { connectConfig } from './config/context/ConfigProvider'
import { ConfigWindow } from './config/ConfigWindow'
import { Sidebar } from './sidebar/Sidebar'
import { TopBar } from './topbar/TopBar'

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
    </div>
  )
}

export const App = connectConfig(AppInner)
