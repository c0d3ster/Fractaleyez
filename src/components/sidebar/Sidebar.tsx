import React, { useState, useEffect, useCallback, useRef } from 'react'
import classNames from 'classnames'
import { Grid, Row } from 'react-bootstrap'
import './Sidebar.css'

import { Presets, PresetSelection } from '../presets/Presets'
import { SavePreset } from '../presets/SavePreset'
import { ConfigAccordion } from '../config/ConfigAccordion'
import { connectConfig } from '../config/context/ConfigProvider'
import { AppConfig } from '../../config/configDefaults'

type SidebarProps = {
  config: AppConfig
  setConfigWindow: () => void
  configWindowVisible: boolean
}

const SidebarInner = ({ config: _config, setConfigWindow, configWindowVisible }: SidebarProps): React.ReactElement => {
  const [sidebarVisible, setSidebarVisible] = useState<boolean | null>(null)
  const [tabVisible, setTabVisible] = useState(true)
  const [prefill, setPrefill] = useState<PresetSelection | null>(null)
  const hideTimerRef = useRef<number | null>(null)

  const hideTabDelayed = useCallback((waitTime: number | React.MouseEvent<HTMLDivElement>) => {
    if (!hideTimerRef.current) {
      hideTimerRef.current = window.setTimeout(() => {
        setTabVisible(false)
        hideTimerRef.current = null
      }, Number.isInteger(waitTime) ? (waitTime as number) : 1000)
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

  const handleSetConfigWindow = useCallback(() => setConfigWindow(), [setConfigWindow])

  useEffect(() => {
    hideTabDelayed(5000)

    const handleKeyUp = (e: KeyboardEvent): void => {
      if (document.activeElement?.tagName === 'INPUT') return
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
          <div className='sidebar-title-row'>
            <h2 className='sidebar-title'>Presets</h2>
            <SavePreset prefill={prefill} onSaved={() => setPrefill(null)} />
          </div>
        </Row>
        <Presets
          onSelect={setPrefill}
          onPackSelect={(pack: string) => setPrefill(prev => prev ? { ...prev, pack } : { name: '', label: '', pack, isOwn: false })}
        />
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

export const Sidebar = connectConfig(SidebarInner)
