import React, { useState, useCallback, useEffect } from 'react'
import axios from 'axios'

import configDefaults from "../../../config/configDefaults"
import { presets } from '../../../config/presets'

const ConfigContext = React.createContext()

const connectConfig = WrappedComponent => props => (
  <ConfigContext.Consumer>
    {context => <WrappedComponent {...props} {...context} />}
  </ConfigContext.Consumer>
)

const titleToCamelCase = (string) => (
  string.toLowerCase().trim().split(/[.\-_\s]/g)
    .reduce((str, word) => str + word[0].toUpperCase() + word.slice(1))
)

const ConfigProvider = ({ children }) => {
  const [config, setConfig] = useState(() => {
    window.config = configDefaults
    return configDefaults
  })

  useEffect(() => {
    const localPresets = JSON.parse(localStorage.getItem('presets'))
    if (!localPresets || presets.length > localPresets.length) {
      localStorage.setItem('presets', JSON.stringify(presets))
    }
  }, [])

  const updateConfigItem = useCallback((category, item, value) => {
    const camelItem = titleToCamelCase(item)
    const camelCategory = titleToCamelCase(category)

    const parsed = parseFloat(value)
    const parsedValue = isNaN(parsed) ? value : parsed

    setConfig((prev) => {
      const next = {
        ...prev,
        [camelCategory]: {
          ...prev[camelCategory],
          [camelItem]: {
            ...prev[camelCategory][camelItem],
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
    let name
    try {
      name = titleToCamelCase(event.target.innerHTML)
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

  const resetConfig = useCallback(() => retrieveConfigPreset({ target: { innerHTML: 'default' } }), [retrieveConfigPreset])

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
