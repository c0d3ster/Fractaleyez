import React, { useState, useCallback, useEffect } from 'react'
import axios from 'axios'

import configDefaults from '../../../config/configDefaults'
import { presets } from '../../../config/presets'

const ConfigContext = React.createContext()

const connectConfig = WrappedComponent => props => (
  <ConfigContext.Consumer>
    {context => <WrappedComponent {...props} {...context} />}
  </ConfigContext.Consumer>
)

const ConfigProvider = ({ children }) => {
  const [config, setConfig] = useState(() => {
    window.config = configDefaults
    return configDefaults
  })

  useEffect(() => {
    const localPresets = JSON.parse(localStorage.getItem('presets'))
    const hasNewPresets = !localPresets || Object.keys(presets).some(key => !localPresets[key])
    if (hasNewPresets) {
      localStorage.setItem('presets', JSON.stringify(presets))
    }
  }, [])

  const updateConfigItem = useCallback((category, item, value) => {
    const parsed = parseFloat(value)
    const parsedValue = isNaN(parsed) ? value : parsed

    setConfig((prev) => {
      const next = {
        ...prev,
        [category]: {
          ...prev[category],
          [item]: {
            ...prev[category][item],
            value: parsedValue
          }
        }
      }
      window.config = next
      return next
    })
  }, [])

  const retrieveCachedPreset = useCallback((name) => JSON.parse(localStorage.getItem('presets'))[name], [])

  const retrieveConfigPreset = useCallback(async (event) => {
    let cfg
    const name = event.currentTarget.dataset.name
    try {
      cfg = retrieveCachedPreset(name)

      if (!cfg) {
        const result = await axios.get(`/api/getConfig/${name}`)
        cfg = result.data
      }
    } catch (error) {
      const errorMessage = error.response?.data || error.message
      console.error(`Error retrieving ${name} preset: ${errorMessage}`)
      return
    }

    setConfig(cfg)
    window.config = cfg
  }, [retrieveCachedPreset])

  const resetConfig = useCallback(() => retrieveConfigPreset({ currentTarget: { dataset: { name: 'default' } } }), [retrieveConfigPreset])

  return (
    <ConfigContext.Provider value={{ config, updateConfigItem, retrieveConfigPreset, resetConfig }}>
      {children}
    </ConfigContext.Provider>
  )
}

export {
  ConfigProvider,
  connectConfig,
  ConfigContext,
}
