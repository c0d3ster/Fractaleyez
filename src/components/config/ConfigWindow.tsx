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
  presets,
  packs,
  onClose,
}: ConfigWindowProps): null => {
  const reactRootRef = useRef<Root | null>(null)

  // Open the external window once on mount
  useEffect(() => {
    const externalWindow = window.open('', '', 'width=1200,height=860,location=no')
    if (!externalWindow) return

    const container = externalWindow.document.createElement('div')
    container.className = 'config-window-root'
    externalWindow.document.title = 'Configuration'
    externalWindow.document.body.appendChild(container)
    externalWindow.addEventListener('beforeunload', onClose)
    copyStyles(document, externalWindow.document)

    const reactRoot = createRoot(container)
    reactRootRef.current = reactRoot

    return () => {
      externalWindow.removeEventListener('beforeunload', onClose)
      reactRoot.unmount()
      reactRootRef.current = null
      externalWindow.close()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
        presets={presets}
        packs={packs}
      />
    )
  }, [
    config,
    updateConfigItem,
    updateVideoClips,
    updateParticleSprites,
    retrieveConfigPreset,
    resetConfig,
    savePreset,
    isSignedIn,
    currentUserId,
    presets,
  ])

  return null
}

export const ConfigWindow = connectConfig(ConfigWindowInner)
