import React, { useState, useEffect, useCallback, useRef } from 'react'
import classNames from 'classnames'
import { Grid, Row } from 'react-bootstrap'
import './Sidebar.css'

import Presets from '../presets/Presets'
import ConfigAccordion from '../config/ConfigAccordion'
import { connectConfig } from '../config/context/ConfigProvider'

const Sidebar = ({ config, setConfigWindow, configWindowVisible }) => {
  const [sidebarVisible, setSidebarVisible] = useState(null)
  const [tabVisible, setTabVisible] = useState(true)
  const hideTimerRef = useRef(null)

  const hideTabDelayed = useCallback((waitTime) => {
    if (!hideTimerRef.current) {
      hideTimerRef.current = window.setTimeout(() => {
        setTabVisible(false)
        hideTimerRef.current = null
      }, Number.isInteger(waitTime) ? waitTime : 1000)
    }
  }, [])

  const showTab = useCallback(() => {
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
    setTabVisible(true)
  }, [])

  const toggleSidebar = useCallback(() => setSidebarVisible((prev) => !prev), [])

  const handleSetConfigWindow = useCallback(() => setConfigWindow(!configWindowVisible), [setConfigWindow, configWindowVisible])

  useEffect(() => {
    hideTabDelayed(5000)

    const handleKeyUp = (e) => {
      if (e.key === 'e') handleSetConfigWindow()
      else if (e.key === 'm') toggleSidebar()
    }

    document.addEventListener('keyup', handleKeyUp)
    return () => document.removeEventListener('keyup', handleKeyUp)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const sidebarContentClasses = classNames('sidebar-content', {
    'slide-in': sidebarVisible,
    'slide-out': sidebarVisible === false
  })
  const tabClasses = classNames('tab', {
    'tab-fade-in': tabVisible,
    'tab-fade-out': !tabVisible
  })
  const expandConfigClasses = classNames('expand-config', {
    'expanded': configWindowVisible
  })

  return (
    <div
      className='sidebar-container'
      onMouseEnter={showTab}
      onMouseLeave={hideTabDelayed}>
      <Grid bsClass={sidebarContentClasses}>
        <button
          className={tabClasses}
          onClick={toggleSidebar}>
          Menu
        </button>
        <Row>
          <h2 className='sidebar-title'>Presets</h2>
        </Row>
        <Presets />
        <Row>
          <h2 className='sidebar-title'>Configuration</h2>
          <button
            className={expandConfigClasses}
            onClick={handleSetConfigWindow}>
            ⤢
          </button>
        </Row>
        <ConfigAccordion canOpenMultiple={false} />
      </Grid>
    </div>
  )
}

export default connectConfig(Sidebar)
