import React, { useEffect, useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Grid, Row, Col } from 'react-bootstrap'

import { Presets, PresetSelection } from '../presets/Presets'
import { SavePreset } from '../presets/SavePreset'
import { ConfigCategory } from './ConfigCategory'
import { ConfigVideo } from './ConfigVideo'
import { copyStyles } from '../../styles/AppStyleCopier'
import { connectConfig, ConfigContext, ConfigContextValue } from './context/ConfigProvider'
import { CameraTouchpad } from './CameraTouchpad'
import { FrequencyHud, PerfHud } from '../huds'

type ExternalWindowBridgeProps = ConfigContextValue

// Renders inside the external window's React root, bridging ConfigContext from the main window
const ExternalWindowBridge = ({
  config,
  updateConfigItem,
  updateVideoClips,
  retrieveConfigPreset,
  resetConfig,
  savePreset,
  isSignedIn,
  currentUserId,
  presets,
}: ExternalWindowBridgeProps): React.ReactElement => {
  const [prefill, setPrefill] = useState<PresetSelection | null>(null)
  return (
    <ConfigContext.Provider
      value={{ config, updateConfigItem, updateVideoClips, retrieveConfigPreset, resetConfig, savePreset, isSignedIn, currentUserId, presets }}
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
          {Object.keys(config).map((category) => (
            <Col sm={2} key={category} style={{ paddingLeft: '8px', paddingRight: '8px' }}>
              {category === 'video'
                ? <>
                    <ConfigVideo isOpen={true} toggleOpen={() => null} />
                    <PerfHud />
                    <CameraTouchpad />
                  </>
                : <>
                    <ConfigCategory
                      name={category}
                      onChange={updateConfigItem}
                      isOpen={true}
                      toggleOpen={() => null} />
                    {category === 'audio' && <FrequencyHud />}
                  </>
              }
            </Col>
            ))}
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
  retrieveConfigPreset,
  resetConfig,
  savePreset,
  isSignedIn,
  currentUserId,
  presets,
  onClose,
}: ConfigWindowProps): null => {
  const reactRootRef = useRef<Root | null>(null)

  // Open the external window once on mount
  useEffect(() => {
    const externalWindow = window.open('', '', 'width=1200,height=850,location=no')
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
        retrieveConfigPreset={retrieveConfigPreset}
        resetConfig={resetConfig}
        savePreset={savePreset}
        isSignedIn={isSignedIn}
        currentUserId={currentUserId}
        presets={presets}
      />
    )
  }, [config, updateConfigItem, updateVideoClips, retrieveConfigPreset, resetConfig, savePreset, isSignedIn, currentUserId, presets])

  return null
}

export const ConfigWindow = connectConfig(ConfigWindowInner)
