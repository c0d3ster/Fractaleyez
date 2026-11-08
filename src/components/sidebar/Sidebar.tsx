import React, { useState, useEffect, useCallback, useRef } from 'react'
import classNames from 'classnames'
import './Sidebar.css'

import { Presets, PresetSelection } from '../presets/Presets'
import { SavePreset } from '../presets/SavePreset'
import { ConfigAccordion, useOpenCategories } from '../config/ConfigAccordion'
import { SLIDE_OUT_MS, shouldRenderConfigBody, canParkConfigBody } from './configBodyParking'
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
  const { openCategories, toggleOpen } = useOpenCategories(false)
  // True once the sidebar has been out of sight, with the expanded config window open, long enough that its config body can go (see configBodyParking.ts).
  const [bodySettled, setBodySettled] = useState(false)

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

  const handleSetConfigWindow = useCallback(() => {
    if (!configWindowVisible) setSidebarVisible(false)
    setConfigWindow()
  }, [setConfigWindow, configWindowVisible])

  useEffect(() => {
    hideTabDelayed(5000)

    const handleKeyUp = (e: KeyboardEvent): void => {
      if (document.activeElement?.tagName === 'INPUT') return
      if (e.key === 'e') handleSetConfigWindow()
      else if (e.key === 'm') toggleSidebar()
    }

    document.addEventListener('keyup', handleKeyUp)
    return () => document.removeEventListener('keyup', handleKeyUp)
  }, [])

  const parkable = canParkConfigBody(configWindowVisible, sidebarVisible)
  useEffect(() => {
    if (!parkable) {
      setBodySettled(false)
      return undefined
    }
    const timer = window.setTimeout(() => setBodySettled(true), SLIDE_OUT_MS)
    return () => window.clearTimeout(timer)
  }, [parkable])
  const showConfigBody = shouldRenderConfigBody(configWindowVisible, sidebarVisible, bodySettled)

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
      <div className={sidebarContentClasses}>
        <button
          className={tabClasses}
          onClick={toggleSidebar}>
          Menu
        </button>
        <div className='sidebar-scroll'>
          <div className='flow-root'>
            <div className='sidebar-title-row'>
              <h2 className='sidebar-title'>Presets</h2>
              <SavePreset prefill={prefill} onSaved={() => setPrefill(null)} />
            </div>
          </div>
          <Presets
            onSelect={setPrefill}
            onPackSelect={(pack: string) => setPrefill(prev => prev ? { ...prev, pack } : { name: '', label: '', pack, isOwn: false })}
          />
          <div className='sidebar-config-row flow-root'>
            <h2 className='sidebar-title'>Configuration</h2>
            <button
              className={expandConfigClasses}
              onClick={handleSetConfigWindow}>
              ⤢
            </button>
          </div>
          {showConfigBody && <ConfigAccordion openCategories={openCategories} toggleOpen={toggleOpen} />}
        </div>
      </div>
    </div>
  )
}

export const Sidebar = connectConfig(SidebarInner)
