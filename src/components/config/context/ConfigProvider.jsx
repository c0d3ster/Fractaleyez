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

/** Preset button labels ("Galaxy Space") → object keys ("galaxySpace") */
const labelToCamelCaseKey = (string) => {
  const words = string.toLowerCase().trim().split(/[.\-_\s]+/).filter(Boolean)
  if (!words.length) return ''
  return words[0] + words.slice(1).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('')
}

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
    let name
    try {
      name = labelToCamelCaseKey(event.target.innerHTML)
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
