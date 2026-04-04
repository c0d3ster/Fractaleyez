import React, { useEffect, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Grid, Row, Col } from 'react-bootstrap'

import { Presets } from '../presets/Presets'
import { ConfigCategory } from './ConfigCategory'
import { ConfigVideo } from './ConfigVideo'
import { copyStyles } from '../../styles/AppStyleCopier'
import { connectConfig, ConfigContext, ConfigContextValue } from './context/ConfigProvider'

type ExternalWindowBridgeProps = ConfigContextValue

// Renders inside the external window's React root, bridging ConfigContext from the main window
const ExternalWindowBridge = ({ config, updateConfigItem, updateVideoClips, retrieveConfigPreset, resetConfig }: ExternalWindowBridgeProps): React.ReactElement => (
  <ConfigContext.Provider value={{ config, updateConfigItem, updateVideoClips, retrieveConfigPreset, resetConfig }}>
    <Grid>
      <Row>
        <Presets expanded />
      </Row>
      <Row>
        {Object.keys(config).map((category) => (
          <Col sm={2} key={category} style={{ paddingLeft: '8px', paddingRight: '8px' }}>
            {category === 'video'
              ? <ConfigVideo isOpen={true} toggleOpen={() => null} />
              : <ConfigCategory
                name={category}
                onChange={updateConfigItem}
                isOpen={true}
                toggleOpen={() => null} />
            }
          </Col>
        ))}
      </Row>
    </Grid>
  </ConfigContext.Provider>
)

type ConfigWindowProps = ConfigContextValue & {
  onClose: () => void
}

const ConfigWindowInner = ({ config, updateConfigItem, updateVideoClips, retrieveConfigPreset, resetConfig, onClose }: ConfigWindowProps): null => {
  const reactRootRef = useRef<Root | null>(null)

  // Open the external window once on mount
  useEffect(() => {
    const externalWindow = window.open('', '', 'width=1200,height=850,location=no')
    if (!externalWindow) return

    const container = externalWindow.document.createElement('div')
    externalWindow.document.title = 'Configuration'
    externalWindow.document.body.appendChild(container)
    externalWindow.addEventListener('beforeunload', onClose)
    copyStyles(document, externalWindow.document)

    const reactRoot = createRoot(container)
    reactRootRef.current = reactRoot

    return () => {
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
      />
    )
  }, [config, updateConfigItem, updateVideoClips, retrieveConfigPreset, resetConfig])

  return null
}

export const ConfigWindow = connectConfig(ConfigWindowInner)
