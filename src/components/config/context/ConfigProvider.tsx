import React, { useState, useCallback, useEffect } from 'react'
import axios from 'axios'

import { AppConfig, configDefaults } from '../../../config/configDefaults'
import { presets } from '../../../config/presets'

export type PresetRetrieveEvent = {
  currentTarget: { dataset: { [key: string]: string | undefined } }
}

export type ConfigContextValue = {
  config: AppConfig
  updateConfigItem: (category: string, item: string, value: string | boolean | number) => void
  updateVideoClips: (clips: string[]) => void
  retrieveConfigPreset: (event: PresetRetrieveEvent) => Promise<void>
  resetConfig: () => void
}

export const ConfigContext = React.createContext<ConfigContextValue | undefined>(undefined)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const connectConfig = (WrappedComponent: React.ComponentType<any>) =>
  (props: Record<string, unknown>): React.ReactElement => (
    <ConfigContext.Consumer>
      {(context) => <WrappedComponent {...props} {...context} />}
    </ConfigContext.Consumer>
  )

export const ConfigProvider = ({ children }: { children: React.ReactNode }): React.ReactElement => {
  const [config, setConfig] = useState<AppConfig>(() => {
    window.config = configDefaults
    return configDefaults
  })

  useEffect(() => {
    const stored = localStorage.getItem('presets')
    const localPresets = stored ? (JSON.parse(stored) as Record<string, unknown>) : null
    const hasNewPresets = !localPresets || Object.keys(presets).some(key => !localPresets[key])
    if (hasNewPresets) {
      localStorage.setItem('presets', JSON.stringify(presets))
    }
  }, [])

  const updateConfigItem = useCallback((category: string, item: string, value: string | boolean | number) => {
    const parsed = typeof value === 'string' ? parseFloat(value) : value
    const parsedValue = typeof parsed === 'number' && isNaN(parsed) ? value : parsed

    setConfig((prev) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const prevAny = prev as any
      const next = {
        ...prev,
        [category]: {
          ...prevAny[category],
          [item]: {
            ...prevAny[category][item],
            value: parsedValue
          }
        }
      } as AppConfig
      window.config = next
      return next
    })
  }, [])

  const retrieveCachedPreset = useCallback((name: string): AppConfig | null => {
    const stored = localStorage.getItem('presets')
    if (!stored) return null
    return (JSON.parse(stored) as Record<string, AppConfig>)[name] ?? null
  }, [])

  const updateVideoClips = useCallback((clips: string[]) => {
    setConfig((prev) => {
      const wasEmpty = !prev.video.clips.length
      const next = { ...prev, video: { ...prev.video, clips } }
      window.config = next
      if (wasEmpty && clips.length) {
        window.dispatchEvent(new CustomEvent('videoClipsRestored', { detail: { clips } }))
      }
      return next
    })
  }, [])

  const retrieveConfigPreset = useCallback(async (event: PresetRetrieveEvent) => {
    const name = event.currentTarget.dataset['name']
    if (!name) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let cfg: any
    try {
      cfg = retrieveCachedPreset(name)

      if (!cfg) {
        const result = await axios.get(`/api/getConfig/${name}`)
        cfg = result.data
      }
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const errorMessage = (error as any).response?.data || (error as any).message
      console.error(`Error retrieving ${name} preset: ${errorMessage}`)
      return
    }

    if (cfg.video && !cfg.video.allClips) {
      cfg = { ...cfg, video: { ...cfg.video, allClips: cfg.video.clips } }
    }

    setConfig(cfg as AppConfig)
    window.config = cfg as AppConfig
  }, [retrieveCachedPreset])

  const resetConfig = useCallback(
    () => retrieveConfigPreset({ currentTarget: { dataset: { name: 'default' } } }),
    [retrieveConfigPreset]
  )

  return (
    <ConfigContext.Provider value={{ config, updateConfigItem, updateVideoClips, retrieveConfigPreset, resetConfig }}>
      {children}
    </ConfigContext.Provider>
  )
}
