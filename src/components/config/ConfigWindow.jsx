import React, { useEffect, useRef } from 'react'
import ReactDOM from 'react-dom'
import { Grid, Row, Col } from 'react-bootstrap'

import Presets from '../presets/Presets'
import ConfigCategory from './ConfigCategory'
import { copyStyles } from '../../styles/AppStyleCopier.js'
import { connectConfig, ConfigContext } from './context/ConfigProvider'

// Renders inside the external window's React root, bridging ConfigContext from the main window
const ExternalWindowBridge = ({ config, updateConfigItem, retrieveConfigPreset, resetConfig }) => (
  <ConfigContext.Provider value={{ config, updateConfigItem, retrieveConfigPreset, resetConfig }}>
    <Grid>
      <Row>
        <Presets />
      </Row>
      <Row>
        {Object.keys(config).map((category) => (
          <Col sm={2} key={category}>
            <ConfigCategory
              name={category}
              onChange={updateConfigItem}
              isOpen={true}
              toggleOpen={() => null} />
          </Col>
        ))}
      </Row>
    </Grid>
  </ConfigContext.Provider>
)

const ConfigWindow = ({ config, updateConfigItem, retrieveConfigPreset, resetConfig, onClose }) => {
  const containerElRef = useRef(null)

  // Open the external window once on mount
  useEffect(() => {
    const externalWindow = window.open('', '', 'width=1200,height=750,location=no')
    if (!externalWindow) return

    const container = externalWindow.document.createElement('div')
    containerElRef.current = container
    externalWindow.document.title = 'Configuration'
    externalWindow.document.body.appendChild(container)
    externalWindow.addEventListener('beforeunload', onClose)
    copyStyles(document, externalWindow.document)

    return () => {
      ReactDOM.unmountComponentAtNode(container)
      externalWindow.close()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-render the external root whenever config changes, keeping both windows in sync
  useEffect(() => {
    if (!containerElRef.current) return
    ReactDOM.render(
      <ExternalWindowBridge
        config={config}
        updateConfigItem={updateConfigItem}
        retrieveConfigPreset={retrieveConfigPreset}
        resetConfig={resetConfig}
      />,
      containerElRef.current
    )
  }, [config, updateConfigItem, retrieveConfigPreset, resetConfig])

  return null
}

export default connectConfig(ConfigWindow)
