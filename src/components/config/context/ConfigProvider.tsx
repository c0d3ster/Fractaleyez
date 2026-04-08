import React, { useState, useCallback, useEffect } from 'react'
import axios from 'axios'
import { useAuth, useUser } from '@clerk/clerk-react'

import { AppConfig, ConfigItem, ParticleConfigSection, configDefaults } from '../../../config/configDefaults'
import { particleConfig } from '../../../config/particle.config'
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

/** Human-readable label: camelCase → words; does not add spaces before capitals that already follow a space. */
const toLabel = (name: string): string => {
  const collapsed = name.trim().replace(/\s+/g, ' ')
  if (!collapsed) return collapsed
  const spaced = collapsed.replace(/([a-z\d])([A-Z])/g, '$1 $2').replace(/\s+/g, ' ').trim()
  return spaced.replace(/^./, c => c.toUpperCase())
}

type ConfigSectionKey = 'user' | 'audio' | 'effects' | 'particle' | 'orbit'

function mergeConfigSection<C extends ConfigSectionKey>(category: C, loaded: Record<string, unknown> | undefined | null): AppConfig[C] {
  const def = configDefaults[category] as Record<string, ConfigItem>
  if (!loaded || typeof loaded !== 'object') {
    return configDefaults[category]
  }
  const out = { ...def } as Record<string, ConfigItem>
  for (const key of Object.keys(def)) {
    const l = loaded[key]
    if (l && typeof l === 'object' && 'value' in (l as object)) {
      const loadedItem = l as ConfigItem
      out[key] = { ...def[key], value: loadedItem.value } as ConfigItem
    }
  }
  return out as AppConfig[C]
}

function normalizeParticleSpritesValue(sprites: unknown): string[] {
  const raw = Array.isArray(sprites) ? sprites.filter((s): s is string => typeof s === 'string') : []
  const { sprites_MIN: spritesMin, sprites_MAX: spritesMax } = particleConfig
  const deduped = [...new Set(raw)].slice(0, spritesMax)
  let next = deduped
  if (next.length < spritesMin) {
    const pad = configDefaults.particle.sprites.value[0] ?? 'fractaleye.png'
    next = [...next, ...Array(spritesMin - next.length).fill(pad)].slice(0, spritesMax)
  }
  return next
}

function mergeVideo(loaded: unknown): AppConfig['video'] {
  const catalog = [...configDefaults.video.allClips]
  if (!loaded || typeof loaded !== 'object') {
    return { clips: [], allClips: catalog, index: 0 }
  }
  const l = loaded as Record<string, unknown>
  const clips = Array.isArray(l.clips) ? (l.clips as string[]) : []
  const allClips = [...new Set([...catalog, ...clips])]
  const indexRaw = typeof l.index === 'number' && Number.isFinite(l.index) ? Math.floor(l.index) : 0
  const index = clips.length === 0 ? 0 : Math.min(Math.max(0, indexRaw), clips.length - 1)
  return { clips, allClips, index }
}

/** Presets from disk/API may omit multiselect metadata or use older shapes — merge with defaults so UI + viz stay valid. */
function normalizeLoadedPreset(cfg: Record<string, unknown>): AppConfig {
  const particle = mergeConfigSection('particle', cfg.particle as Record<string, unknown> | undefined) as ParticleConfigSection
  return {
    user: mergeConfigSection('user', cfg.user as Record<string, unknown> | undefined),
    audio: mergeConfigSection('audio', cfg.audio as Record<string, unknown> | undefined),
    effects: mergeConfigSection('effects', cfg.effects as Record<string, unknown> | undefined),
    particle: {
      ...particle,
      sprites: {
        ...particle.sprites,
        value: normalizeParticleSpritesValue(particle.sprites.value),
      },
    },
    orbit: mergeConfigSection('orbit', cfg.orbit as Record<string, unknown> | undefined),
    video: mergeVideo(cfg.video),
  }
}

export type ConfigContextValue = {
  config: AppConfig
  updateConfigItem: (category: string, item: string, value: string | boolean | number) => void
  updateVideoClips: (clips: string[]) => void
  updateParticleSprites: (sprites: string[]) => void
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
    try {
      const stored = localStorage.getItem('presets')
      if (!stored) return null
      return (JSON.parse(stored) as Record<string, AppConfig>)[cacheKey] ?? null
    } catch {
      return null
    }
  }, [])

  const updateParticleSprites = useCallback((sprites: string[]) => {
    const { sprites_MIN: spritesMin, sprites_MAX: spritesMax } = particleConfig
    const deduped = [...new Set(sprites)].slice(0, spritesMax)
    let next = deduped
    if (next.length < spritesMin) {
      const pad = configDefaults.particle.sprites.value[0] ?? 'fractaleye.png'
      next = [...next, ...Array(spritesMin - next.length).fill(pad)].slice(0, spritesMax)
    }
    setConfig((prev) => {
      const n = {
        ...prev,
        particle: {
          ...prev.particle,
          sprites: {
            ...prev.particle.sprites,
            value: next,
          },
        },
      } as AppConfig
      window.config = n
      return n
    })
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
    const name = event.currentTarget?.dataset?.name
    const id = event.currentTarget?.dataset?.id
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

    const prevClips = window.config.video.clips
    const next = normalizeLoadedPreset(cfgAny)
    setConfig(next)
    window.config = next
    const sameClips =
      prevClips.length === next.video.clips.length &&
      prevClips.every((c, i) => c === next.video.clips[i])
    if (!sameClips) {
      window.dispatchEvent(new CustomEvent('videoClipsRestored', { detail: { clips: next.video.clips } }))
    }
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
      const matches = (p: PresetMeta): boolean => p.id === data.id || p.name === data.name
      const exists = prev.some(matches)
      return exists ? prev.map(p => (matches(p) ? newPreset : p)) : [...prev, newPreset]
    })
  }, [config, getToken])

  return (
    <ConfigContext.Provider value={{ config, updateConfigItem, updateVideoClips, updateParticleSprites, retrieveConfigPreset, resetConfig, savePreset, isSignedIn: isSignedIn ?? false, currentUserId: user?.id ?? null, presets: presetList }}>
      {children}
    </ConfigContext.Provider>
  )
}
