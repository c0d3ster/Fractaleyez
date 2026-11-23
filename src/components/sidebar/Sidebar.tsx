import React, { useState, useEffect, useCallback, useRef } from 'react'
import classNames from 'classnames'
import './Sidebar.css'

import { PreviewLockFrame } from '../presets/PreviewLockFrame'
import { Presets, PresetSelection } from '../presets/Presets'
import { SavePreset } from '../presets/SavePreset'
import { ConfigAccordion, useOpenCategories } from '../config/ConfigAccordion'
import { SLIDE_OUT_MS, shouldRenderConfigBody, canParkConfigBody } from './configBodyParking'

const SUB_ACCORDION_TITLE = '.config-sub-accordion__title'
/** The headers that still open and close their section during a premium preview: each section's title and the Orbit column's sub-accordions. */
const PEEK_SELECTOR = `[data-config-entry] > div > .category-container > .category-title, ${SUB_ACCORDION_TITLE}`

type SidebarProps = {
  setConfigWindow: () => void
  configWindowVisible: boolean
}

const SidebarInner = ({ setConfigWindow, configWindowVisible }: SidebarProps): React.ReactElement => {
  const [sidebarVisible, setSidebarVisible] = useState<boolean | null>(null)
  const [tabVisible, setTabVisible] = useState(true)
  const [prefill, setPrefill] = useState<PresetSelection | null>(null)
  const hideTimerRef = useRef<number | null>(null)
  const { openCategories, toggleOpen } = useOpenCategories(false)
  // During a premium preview the controls are locked, but a section header still opens and closes its section so the config can be looked through.
  const peekSection = useCallback((header: HTMLElement): void => {
    if (header.matches(SUB_ACCORDION_TITLE)) {
      header.click()
      return
    }
    const entry = header.closest<HTMLElement>('[data-config-entry]')?.dataset.configEntry
    if (entry) toggleOpen(entry)
  }, [toggleOpen])
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
          {showConfigBody && (
            <PreviewLockFrame peekSelector={PEEK_SELECTOR} onPeek={peekSection}>
              <ConfigAccordion openCategories={openCategories} toggleOpen={toggleOpen} />
            </PreviewLockFrame>
          )}
        </div>
      </div>
    </div>
  )
}

export const Sidebar = SidebarInner
