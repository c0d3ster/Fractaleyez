import React, { useEffect, useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Grid, Row, Col } from 'react-bootstrap'

import { Presets, PresetSelection } from '../presets/Presets'
import { SavePreset } from '../presets/SavePreset'
import { ConfigCategory } from './ConfigCategory'
import { ConfigVideo } from './ConfigVideo'
import { copyStyles } from '../../styles/AppStyleCopier'
import { CONFIG_WINDOW_COLUMN_ORDER } from '../../config/configDefaults'
import { connectConfig, ConfigContext, ConfigContextValue } from './context/ConfigProvider'
import { CameraTouchpad } from './CameraTouchpad'
import { FrequencyHud, PerfHud, ParticleSpriteHud } from '../huds'

const DEFAULT_WINDOW_FEATURES = 'width=1200,height=860,location=no'
const POPOUT_WIDTH = 1200

// Positions the popout on a second screen at full available height when the Window Management
// API is available and permitted; falls back to the default same-screen size/placement otherwise
// (unsupported in Firefox/Safari, and requires a permission prompt in Chromium).
const resolveWindowFeatures = async (): Promise<string> => {
  if (!window.getScreenDetails || !window.screen.isExtended) return DEFAULT_WINDOW_FEATURES
  try {
    const screenDetails = await window.getScreenDetails()
    const { currentScreen } = screenDetails
    const secondScreen = screenDetails.screens.find((s) => s !== currentScreen)
    if (!secondScreen) return DEFAULT_WINDOW_FEATURES
    // Dock against the seam between the two screens rather than always at the second
    // screen's left edge: if it's to the left of the current screen, that seam is its
    // right edge; if it's to the right, the seam is its left edge (today's behavior).
    const secondScreenIsToTheLeft = secondScreen.availLeft < currentScreen.availLeft
    const left = secondScreenIsToTheLeft
      ? secondScreen.availLeft + secondScreen.availWidth - POPOUT_WIDTH
      : secondScreen.availLeft
    return `width=${POPOUT_WIDTH},height=${secondScreen.availHeight},left=${left},top=${secondScreen.availTop},location=no`
  } catch {
    return DEFAULT_WINDOW_FEATURES
  }
}

type ExternalWindowBridgeProps = ConfigContextValue

// Renders inside the external window's React root, bridging ConfigContext from the main window
const ExternalWindowBridge = ({
  config,
  updateConfigItem,
  updateVideoClips,
  updateParticleSprites,
  retrieveConfigPreset,
  revertConfig,
  resetConfig,
  savePreset,
  isSignedIn,
  currentUserId,
  getToken,
  presets,
  packs,
}: ExternalWindowBridgeProps): React.ReactElement => {
  const [prefill, setPrefill] = useState<PresetSelection | null>(null)
  return (
    <ConfigContext.Provider
      value={{
        config,
        updateConfigItem,
        updateVideoClips,
        updateParticleSprites,
        retrieveConfigPreset,
        revertConfig,
        resetConfig,
        savePreset,
        isSignedIn,
        currentUserId,
        getToken,
        presets,
        packs,
      }}
    >
      <Grid>
        <Row>
          <Presets
            expanded
            onSelect={setPrefill}
            onPackSelect={(pack: string) => setPrefill(prev => prev ? { ...prev, pack } : { name: '', label: '', pack, isOwn: false })}
            headerActions={<SavePreset prefill={prefill} onSaved={() => setPrefill(null)} />}
          />
        </Row>
        <Row>
          {CONFIG_WINDOW_COLUMN_ORDER.map((segment) => {
            const colStyle = { paddingLeft: '8px', paddingRight: '8px' }
            if (segment === 'effects_particle') {
              return (
                <Col sm={2} key='effects_particle' style={colStyle}>
                  <ConfigCategory
                    name='effects'
                    onChange={updateConfigItem}
                    isOpen={true}
                    toggleOpen={() => null}
                  />
                  <ParticleSpriteHud />
                </Col>
              )
            }
            if (segment === 'video') {
              return (
                <Col sm={2} key='video' style={colStyle}>
                  <ConfigVideo isOpen={true} toggleOpen={() => null} />
                  <PerfHud />
                  <CameraTouchpad />
                </Col>
              )
            }
            return (
              <Col sm={2} key={segment} style={colStyle}>
                <ConfigCategory
                  name={segment}
                  onChange={updateConfigItem}
                  isOpen={true}
                  toggleOpen={() => null}
                />
                {segment === 'audio' ? <FrequencyHud /> : null}
              </Col>
            )
          })}
        </Row>
      </Grid>
    </ConfigContext.Provider>
  )
}

type ConfigWindowProps = ConfigContextValue & {
  onClose: () => void
}

const ConfigWindowInner = ({
  config,
  updateConfigItem,
  updateVideoClips,
  updateParticleSprites,
  retrieveConfigPreset,
  revertConfig,
  resetConfig,
  savePreset,
  isSignedIn,
  currentUserId,
  getToken,
  presets,
  packs,
  onClose,
}: ConfigWindowProps): null => {
  const reactRootRef = useRef<Root | null>(null)
  // Root creation is now async (waits on second-screen resolution) — this flips once the root
  // exists so the render effect below re-fires even if config/presets/etc haven't changed since.
  const [externalRootReady, setExternalRootReady] = useState(false)

  // Open the external window once on mount
  useEffect(() => {
    let cancelled = false
    let externalWindow: Window | null = null

    const closeExternalWindow = (): void => externalWindow?.close()

    const setup = async (): Promise<void> => {
      const features = await resolveWindowFeatures()
      if (cancelled) return

      externalWindow = window.open('', '', features)
      if (!externalWindow) return

      const container = externalWindow.document.createElement('div')
      container.className = 'config-window-root'
      externalWindow.document.title = 'Configuration'
      externalWindow.document.body.appendChild(container)
      externalWindow.addEventListener('beforeunload', onClose)
      window.addEventListener('beforeunload', closeExternalWindow)
      copyStyles(document, externalWindow.document)

      reactRootRef.current = createRoot(container)
      setExternalRootReady(true)
    }

    void setup()

    return () => {
      cancelled = true
      window.removeEventListener('beforeunload', closeExternalWindow)
      externalWindow?.removeEventListener('beforeunload', onClose)
      reactRootRef.current?.unmount()
      reactRootRef.current = null
      externalWindow?.close()
    }
  }, [])

  // Re-render the external root whenever config changes, keeping both windows in sync
  useEffect(() => {
    if (!reactRootRef.current) return
    reactRootRef.current.render(
      <ExternalWindowBridge
        config={config}
        updateConfigItem={updateConfigItem}
        updateVideoClips={updateVideoClips}
        updateParticleSprites={updateParticleSprites}
        retrieveConfigPreset={retrieveConfigPreset}
        revertConfig={revertConfig}
        resetConfig={resetConfig}
        savePreset={savePreset}
        isSignedIn={isSignedIn}
        currentUserId={currentUserId}
        getToken={getToken}
        presets={presets}
        packs={packs}
      />
    )
  }, [
    externalRootReady,
    config,
    updateConfigItem,
    updateVideoClips,
    updateParticleSprites,
    retrieveConfigPreset,
    resetConfig,
    savePreset,
    isSignedIn,
    currentUserId,
    getToken,
    presets,
  ])

  return null
}

export const ConfigWindow = connectConfig(ConfigWindowInner)
