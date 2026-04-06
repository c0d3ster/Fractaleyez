import React, { useState, useCallback, useEffect } from 'react'
import axios from 'axios'
import { useAuth, useUser } from '@clerk/clerk-react'

import { AppConfig, configDefaults } from '../../../config/configDefaults'
import { presets } from '../../../config/presets'

export type PresetRetrieveEvent = {
  currentTarget: { dataset: { [key: string]: string | undefined } }
}

export type PresetMeta = {
  id?: string
  name: string
  label: string
  pack: string
  sprite: string
  isOwn: boolean
}

type ApiPreset = {
  id: string
  name: string
  pack: string
  sprite: string
  isOwn: boolean
}

const toLabel = (name: string): string => name.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())

export type ConfigContextValue = {
  config: AppConfig
  updateConfigItem: (category: string, item: string, value: string | boolean | number) => void
  updateVideoClips: (clips: string[]) => void
  retrieveConfigPreset: (event: PresetRetrieveEvent) => Promise<void>
  resetConfig: () => void
  savePreset: (name: string, pack: string, force?: boolean) => Promise<void>
  isSignedIn: boolean
  currentUserId: string | null
  presets: PresetMeta[]
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

  const [presetList, setPresetList] = useState<PresetMeta[]>([])

  useEffect(() => {
    if (!localStorage.getItem('presets')) {
      localStorage.setItem('presets', JSON.stringify(presets))
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const load = async (): Promise<void> => {
      try {
        const token = await getToken()
        const { data } = await axios.get<ApiPreset[]>('/api/presets', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        if (cancelled) return
        setPresetList(data.map(p => ({ ...p, label: toLabel(p.name) })))
      } catch (err) {
        console.error('Failed to load presets from API, falling back to bundled', err)
        if (cancelled) return
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const bundled = Object.entries(presets).map(([name, data]: [string, any]) => ({
          name,
          label: toLabel(name),
          pack: (data.pack ?? '') as string,
          sprite: (data.particle?.sprites?.value?.[0] ?? 'fractaleye.png') as string,
          isOwn: false,
          id: undefined,
        }))
        setPresetList(bundled)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [getToken])

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

  const retrieveCachedPreset = useCallback((cacheKey: string): AppConfig | null => {
    const stored = localStorage.getItem('presets')
    if (!stored) return null
    return (JSON.parse(stored) as Record<string, AppConfig>)[cacheKey] ?? null
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
    const id = event.currentTarget.dataset['id']
    if (!name) return

    const cacheKey = id || name

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let cfg: any

    cfg = retrieveCachedPreset(cacheKey)

    if (!cfg) {
      if (id) {
        try {
          const result = await axios.get('/api/preset', { params: { id } })
          cfg = result.data.config
          const stored = localStorage.getItem('presets')
          const cached = stored ? (JSON.parse(stored) as Record<string, unknown>) : {}
          localStorage.setItem('presets', JSON.stringify({ ...cached, [cacheKey]: cfg }))
        } catch {
          cfg = (presets as Record<string, unknown>)[name] ?? null
          if (!cfg) {
            console.error(`Preset "${name}" not found locally or via API`)
            return
          }
          console.warn(`Using bundled preset for "${name}" (offline fallback)`)
          cfg = structuredClone(cfg)
        }
      } else {
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
    const { data } = await axios.post<{ id: string; name: string }>('/api/savePreset', {
      name,
      pack,
      config,
      force: force ?? false,
    }, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const sprite = config.particle.sprites.value[0] ?? 'fractaleye.png'
    const newPreset: PresetMeta = { id: data.id, name: data.name, label: toLabel(data.name), pack, sprite, isOwn: true }
    setPresetList(prev => {
      const exists = prev.some(p => p.id === data.id || p.name === data.name)
      return exists ? prev.map(p => (p.name === data.name ? newPreset : p)) : [...prev, newPreset]
    })
  }, [config, getToken])

  return (
    <ConfigContext.Provider value={{ config, updateConfigItem, updateVideoClips, retrieveConfigPreset, resetConfig, savePreset, isSignedIn: isSignedIn ?? false, currentUserId: user?.id ?? null, presets: presetList }}>
      {children}
    </ConfigContext.Provider>
  )
}
