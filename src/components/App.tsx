import React, { useState, useEffect, useCallback } from 'react'
import '../styles/App.css'
import 'bootstrap/dist/css/bootstrap.min.css'

import { initWithMicrophone } from '../main'
import { connectConfig } from './config/context/ConfigProvider'
import { ConfigWindow } from './config/ConfigWindow'
import { Sidebar } from './sidebar/Sidebar'

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
    </div>
  )
}

export const App = connectConfig(AppInner)
// default export retained for index.jsx compatibility (remove in Phase 5)
export default App
