import React, { useState, useCallback, useEffect } from 'react'
import axios from 'axios'
import { useAuth, useUser } from '@clerk/clerk-react'

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
  savePreset: (name: string, pack: string, force?: boolean) => Promise<void>
  isSignedIn: boolean
  currentUserId: string | null
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
  const { getToken } = useAuth()
  const { isSignedIn, user } = useUser()

  const [config, setConfig] = useState<AppConfig>(() => {
    window.config = configDefaults
    return configDefaults
  })

  useEffect(() => {
    if (!localStorage.getItem('presets')) {
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
      const hadClips = prev.video.clips.length > 0
      const hasClips = clips.length > 0
      let video = { ...prev.video, clips }
      if (!hasClips) {
        video = { ...video, index: 0 }
      } else if (video.index >= clips.length) {
        video = { ...video, index: clips.length - 1 }
      }
      const next = { ...prev, video } as AppConfig
      window.config = next
      // Only (re)create or tear down the WebGL video plane when clips go on/off.
      // If we dispatched on every checkbox change, createVideoPlane would restart playback.
      if (!hadClips && hasClips) {
        window.dispatchEvent(new CustomEvent('videoClipsRestored', { detail: { clips } }))
      } else if (hadClips && !hasClips) {
        window.dispatchEvent(new CustomEvent('videoClipsRestored', { detail: { clips: [] } }))
      }
      return next
    })
  }, [])

  const retrieveConfigPreset = useCallback(async (event: PresetRetrieveEvent) => {
    const name = event.currentTarget.dataset['name']
    if (!name) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let cfg: any

    cfg = retrieveCachedPreset(name)

    if (!cfg) {
      try {
        const result = await axios.get(`/api/getConfig/${name}`)
        cfg = result.data
        const stored = localStorage.getItem('presets')
        const cached = stored ? (JSON.parse(stored) as Record<string, unknown>) : {}
        localStorage.setItem('presets', JSON.stringify({ ...cached, [name]: cfg }))
      } catch {
        cfg = (presets as Record<string, unknown>)[name] ?? null
        if (!cfg) {
          console.error(`Preset "${name}" not found locally or via API`)
          return
        }
        console.warn(`Using bundled preset for "${name}" (offline fallback)`)
        cfg = structuredClone(cfg)
      }
    }

    // Strip metadata fields that aren't part of AppConfig
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cfgAny = cfg as Record<string, any>
    delete cfgAny['pack']

    if (cfgAny['video'] && !cfgAny['video'].allClips) {
      cfgAny['video'] = { ...cfgAny['video'], allClips: cfgAny['video'].clips }
    }

    setConfig(cfgAny as AppConfig)
    window.config = cfgAny as AppConfig
  }, [retrieveCachedPreset])

  const resetConfig = useCallback(
    () => retrieveConfigPreset({ currentTarget: { dataset: { name: 'default' } } }),
    [retrieveConfigPreset]
  )

  const savePreset = useCallback(async (name: string, pack: string, force?: boolean) => {
    const token = await getToken()
    if (!token) throw Object.assign(new Error('Not authenticated'), { response: { status: 401, data: { error: 'Not authenticated — try signing out and back in' } } })
    await axios.post('/api/savePreset', {
      name,
      pack,
      config,
      force: force ?? false,
    }, {
      headers: { Authorization: `Bearer ${token}` },
    })
  }, [config, getToken])

  return (
    <ConfigContext.Provider value={{ config, updateConfigItem, updateVideoClips, retrieveConfigPreset, resetConfig, savePreset, isSignedIn: isSignedIn ?? false, currentUserId: user?.id ?? null }}>
      {children}
    </ConfigContext.Provider>
  )
}
