import React, { useState, useCallback, useEffect, useRef } from 'react'
import axios from 'axios'
import { useAuth, useUser } from '@clerk/clerk-react'

import { toStoredConfig } from '../../../config/storedConfig'
import { AppConfig, ConfigItem, LayerKey, ParticleConfigSection, configDefaults } from '../../../config/configDefaults'
import { LAYER_CAP } from '../../../config/layers'
import { mergeLayers } from '../../../config/mergeLayers'
import { particleConfig } from '../../../config/particle.config'
import { presets } from '../../../config/presets'
import { warmSpriteCache } from '../../../utils/spriteCache'
import { persistClerkPhotoAsLogo } from '../../../utils/clerkPhotoLogo'
import { resolveUserParticle, resolveUserSprites, restoreUserReference, UserReferenceContext } from '../../../utils/userReference'
import { setParticleCrossfadeDurationMs } from '../../../config/visualizer.config'
import { UserSettings, USER_SETTINGS_SAVE_DEBOUNCE_MS } from '../../../config/userSettings.config'
import { isValidBandSelection } from '../../../audioanalysis/onset-bands'

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

export type PackMeta = {
  id: string
  name: string
  slug: string
  isPremium: boolean
  isOwn: boolean
}

type ApiPreset = {
  id: string
  name: string
  pack: string
  sprite: string
  isOwn: boolean
}

type ApiPack = {
  id: string
  name: string
  slug: string
  isPremium: boolean
  isOwn: boolean
}

type ApiMeResponse = {
  clerkId: string
  displayName: string
  settings: UserSettings
}

/** Applies a loaded/patched settings value to the systems that poll it live outside React (crossfade duration, frequency-band HUD). */
const applyUserSettingsSideEffects = (settings: Partial<UserSettings>): void => {
  if (typeof settings.crossfadeDurationMs === 'number') {
    setParticleCrossfadeDurationMs(settings.crossfadeDurationMs)
  }
  if (settings.hud?.enabledFreqBands && isValidBandSelection(settings.hud.enabledFreqBands)) {
    window.enabledFreqBands = [...settings.hud.enabledFreqBands]
  }
}

/** Human-readable label: camelCase → words; does not add spaces before capitals that already follow a space. */
const toLabel = (name: string): string => {
  const collapsed = name.trim().replace(/\s+/g, ' ')
  if (!collapsed) return collapsed
  const spaced = collapsed.replace(/([a-z\d])([A-Z])/g, '$1 $2').replace(/\s+/g, ' ').trim()
  return spaced.replace(/^./, c => c.toUpperCase())
}

export type ConfigSectionKey = 'user' | 'fractal' | 'audio' | 'effects' | 'color' | 'particle' | 'orbit' | 'logo'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'string')

/** A preset item is stored as a bare value; older presets stored the whole item object, so unwrap its `value`. */
const unwrapStoredValue = (stored: unknown): unknown => (isRecord(stored) && 'value' in stored ? stored.value : stored)

/** Applies a stored value onto a default item, or returns null when the value is the wrong type for that item. */
const withStoredValue = (item: ConfigItem, stored: unknown): ConfigItem | null => {
  const value = unwrapStoredValue(stored)
  switch (item.type) {
  case 'slider':
    return typeof value === 'number' && Number.isFinite(value) ? { ...item, value } : null
  case 'checkbox':
    return typeof value === 'boolean' ? { ...item, value } : null
  case 'multiselect':
    return isStringArray(value) ? { ...item, value } : null
  }
}

// Out-of-range slider values are kept on purpose: a preset may go beyond min/max, which only bound the UI.
const mergeConfigSection = <C extends ConfigSectionKey>(category: C, loaded: Record<string, unknown> | undefined | null): AppConfig[C] => {
  const def = configDefaults[category] as Record<string, ConfigItem>
  if (!loaded || typeof loaded !== 'object') {
    return configDefaults[category]
  }
  const out = { ...def } as Record<string, ConfigItem>
  for (const [key, defaultItem] of Object.entries(def)) {
    const merged = withStoredValue(defaultItem, loaded[key])
    if (merged) out[key] = merged
  }
  return out as AppConfig[C]
}

const normalizeParticleSpritesValue = (sprites: unknown): string[] => {
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

const mergeVideo = (loaded: unknown): AppConfig['video'] => {
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

/** Saturation used to live in the particle section; older presets (bundled, cached or stored) still carry it there. */
const colorSectionFrom = (cfg: Record<string, unknown>): Record<string, unknown> | undefined => {
  const legacySaturation = isRecord(cfg.particle) ? cfg.particle.saturation : undefined
  const color = isRecord(cfg.color) ? cfg.color : undefined
  if (legacySaturation === undefined) return color
  return { saturation: legacySaturation, ...color }
}

/** Presets from disk/API may omit multiselect metadata or use older shapes — merge with defaults so UI + viz stay valid. */
const normalizeLoadedPreset = (cfg: Record<string, unknown>): AppConfig => {
  const particle = mergeConfigSection('particle', cfg.particle as Record<string, unknown> | undefined) as ParticleConfigSection
  const video = mergeVideo(cfg.video)
  return {
    user: mergeConfigSection('user', cfg.user as Record<string, unknown> | undefined),
    fractal: mergeConfigSection('fractal', cfg.fractal as Record<string, unknown> | undefined),
    audio: mergeConfigSection('audio', cfg.audio as Record<string, unknown> | undefined),
    effects: mergeConfigSection('effects', cfg.effects as Record<string, unknown> | undefined),
    color: mergeConfigSection('color', colorSectionFrom(cfg)),
    particle: {
      ...particle,
      sprites: {
        ...particle.sprites,
        value: normalizeParticleSpritesValue(particle.sprites.value),
      },
    },
    orbit: mergeConfigSection('orbit', cfg.orbit as Record<string, unknown> | undefined),
    video,
    layers: mergeLayers(cfg.layers, video.clips.length),
    logo: mergeConfigSection('logo', cfg.logo as Record<string, unknown> | undefined),
  }
}

/** The live `@user` stand-in for the active preset, kept so it can be re-resolved when user data arrives and un-resolved on save. */
type ActiveUserReference = { resolved: string; presetFallback: string | undefined }

/** Resolves a normalized preset's `@user` particle reference against the current user (load time, never save time). */
const resolveUserReferenceIn = (
  cfg: AppConfig,
  context: UserReferenceContext,
): { config: AppConfig; active: ActiveUserReference | null } => {
  const { sprites, resolved } = resolveUserSprites(cfg.particle.sprites.value, context)
  if (sprites === cfg.particle.sprites.value) return { config: cfg, active: null }
  const config: AppConfig = {
    ...cfg,
    particle: { ...cfg.particle, sprites: { ...cfg.particle.sprites, value: normalizeParticleSpritesValue(sprites) } },
  }
  const presetFallback = sprites.find(s => s !== resolved)
  return { config, active: resolved ? { resolved, presetFallback } : null }
}

export type ConfigContextValue = {
  config: AppConfig
  updateConfigItem: (category: string, item: string, value: string | boolean | number) => void
  updateVideoClips: (clips: string[]) => void
  updateParticleSprites: (sprites: string[]) => Promise<void>
  updateLogoSprite: (sprite: string) => Promise<void>
  /** Sets one of the Color section's list items: the chosen palette (one id) or the custom palette's colors. */
  updateColorList: (item: 'palette' | 'customStops', values: string[]) => void
  setLayerEnabled: (key: LayerKey, enabled: boolean) => boolean
  setLayerOpacity: (key: LayerKey, opacity: number) => void
  moveLayer: (key: LayerKey, toIndex: number) => void
  retrieveConfigPreset: (event: PresetRetrieveEvent) => Promise<void>
  revertConfig: (snapshot: AppConfig) => void
  resetConfig: () => void
  /** Restore one item to the value it had when the active preset loaded (or was last saved). */
  resetConfigItem: (category: ConfigSectionKey, item: string) => void
  /** Restore a whole section to the active preset's loaded values. */
  resetConfigSection: (category: ConfigSectionKey) => Promise<void>
  /** Restore the video clip list to the active preset's loaded clips (video is not a plain config section). */
  resetVideoClips: () => void
  savePreset: (name: string, pack: string, force?: boolean) => Promise<void>
  isSignedIn: boolean
  currentUserId: string | null
  getToken: () => Promise<string | null>
  presets: PresetMeta[]
  packs: PackMeta[]
  userSettings: UserSettings | null
  updateUserSettings: (patch: Partial<UserSettings>) => void
}

export const ConfigContext = React.createContext<ConfigContextValue | undefined>(undefined)

export const connectConfig = <P extends Partial<ConfigContextValue>>(WrappedComponent: React.ComponentType<P>) =>
  (props: Omit<P, keyof ConfigContextValue>): React.ReactElement => (
    <ConfigContext.Consumer>
      {(context) => <WrappedComponent {...props as P} {...context} />}
    </ConfigContext.Consumer>
  )

export const ConfigProvider = ({ children }: { children: React.ReactNode }): React.ReactElement => {
  const { getToken } = useAuth()
  const { isSignedIn, user } = useUser()

  const [config, setConfig] = useState<AppConfig>(() => {
    const bundledDefault = presets.default
    const initial = bundledDefault ? normalizeLoadedPreset(structuredClone(bundledDefault.config)) : configDefaults
    window.config = initial
    return initial
  })

  // Values the active preset had when it loaded (or was last saved); the target of per-item and per-section reset.
  const baselineRef = useRef<AppConfig>(config)

  const [presetList, setPresetList] = useState<PresetMeta[]>([])
  const [packList, setPackList] = useState<PackMeta[]>([])
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null)
  const [displayName, setDisplayName] = useState<string | null>(null)
  const userContext: UserReferenceContext = { logoParticle: userSettings?.logoParticle, displayName }
  const userContextRef = useRef(userContext)
  userContextRef.current = userContext
  const activeUserReferenceRef = useRef<ActiveUserReference | null>(null)
  const clerkPhotoAttemptedRef = useRef(false)
  const pendingSettingsPatchRef = useRef<Partial<UserSettings>>({})
  const settingsSaveTimerRef = useRef<number | null>(null)

  useEffect(() => {
    void warmSpriteCache(window.config.particle.sprites.value)
  }, [])

  useEffect(() => {
    if (!localStorage.getItem('presets')) {
      localStorage.setItem('presets', JSON.stringify(
        Object.fromEntries(Object.entries(presets).map(([k, v]) => [k, v.config]))
      ))
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
        const bundled = Object.entries(presets).map(([name, data]) => ({
          name,
          label: toLabel(name),
          pack: data.pack,
          sprite: data.sprite,
          isOwn: false,
          id: undefined,
        }))
        setPresetList(bundled)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [getToken])

  useEffect(() => {
    let cancelled = false
    const load = async (): Promise<void> => {
      try {
        const token = await getToken()
        const { data } = await axios.get<ApiPack[]>('/api/packs', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        if (cancelled) return
        setPackList(data)
      } catch (err) {
        console.error('Failed to load packs', err)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [getToken])

  // Lazy-creates/fetches the app-data user doc. Independent of the preset/pack loads above:
  // a timeout or 5xx here must never block preset/pack data or the bundled-preset fallback.
  useEffect(() => {
    if (!isSignedIn) return
    let cancelled = false
    const load = async (): Promise<void> => {
      try {
        const token = await getToken()
        if (!token) return
        const { data } = await axios.get<ApiMeResponse>('/api/me', { headers: { Authorization: `Bearer ${token}` } })
        if (cancelled) return
        setUserSettings(data.settings)
        setDisplayName(data.displayName || null)
        applyUserSettingsSideEffects(data.settings)

        // Only when no logo is set yet: persist a sprite-processed copy of the Clerk social photo as the
        // user's logoParticle, so the `@user` resolver's per-user-settings rung already covers it.
        if (data.settings.logoParticle || clerkPhotoAttemptedRef.current || !user?.hasImage) return
        clerkPhotoAttemptedRef.current = true
        const url = await persistClerkPhotoAsLogo(user.imageUrl, token)
        if (cancelled || !url || userContextRef.current.logoParticle) return
        updateUserSettings({ logoParticle: url })
      } catch (err) {
        console.error('Failed to load /api/me', err)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [isSignedIn, getToken])

  useEffect(() => {
    return () => {
      if (settingsSaveTimerRef.current) window.clearTimeout(settingsSaveTimerRef.current)
    }
  }, [])

  // Applies a settings patch (crossfade duration slider, logo upload, HUD band toggle) locally
  // and to the systems that poll it live (see applyUserSettingsSideEffects) immediately, then
  // debounces the actual PATCH so a slider drag or rapid HUD clicks collapse into one request.
  // Skips the network write when signed out -- settings require a user doc (see meHandler) --
  // but still applies local/side-effect state so the same controls keep working client-only,
  // same as every other config control in this file.
  const updateUserSettings = useCallback((patch: Partial<UserSettings>) => {
    setUserSettings(prev => ({
      ...prev,
      ...patch,
      hud: patch.hud ? { ...prev?.hud, ...patch.hud } : prev?.hud,
    }))
    applyUserSettingsSideEffects(patch)

    if (!isSignedIn) return

    pendingSettingsPatchRef.current = {
      ...pendingSettingsPatchRef.current,
      ...patch,
      hud: patch.hud ? { ...pendingSettingsPatchRef.current.hud, ...patch.hud } : pendingSettingsPatchRef.current.hud,
    }

    if (settingsSaveTimerRef.current) window.clearTimeout(settingsSaveTimerRef.current)
    settingsSaveTimerRef.current = window.setTimeout(() => {
      settingsSaveTimerRef.current = null
      const toSave = pendingSettingsPatchRef.current
      pendingSettingsPatchRef.current = {}
      void (async () => {
        try {
          const token = await getToken()
          if (!token) return
          await axios.patch('/api/me', toSave, { headers: { Authorization: `Bearer ${token}` } })
        } catch (err) {
          console.error('Failed to save user settings', err)
        }
      })()
    }, USER_SETTINGS_SAVE_DEBOUNCE_MS)
  }, [isSignedIn, getToken])

  const updateConfigItem = useCallback((category: string, item: string, value: string | boolean | number) => {
    const parsed = typeof value === 'string' ? parseFloat(value) : value
    const parsedValue = typeof parsed === 'number' && isNaN(parsed) ? value : parsed

    setConfig((prev) => {
      // category/item are dynamic DOM input `name` attributes, not statically known keys of AppConfig
      const sections = prev as unknown as Record<string, Record<string, ConfigItem>>
      const updated: AppConfig = {
        ...prev,
        [category]: {
          ...sections[category],
          [item]: {
            ...sections[category]?.[item],
            value: parsedValue
          }
        }
      }
      // Reversing the palette flips the whole range bar, so its handles flip with it and keep the same colors selected.
      const flipsRange = category === 'color' && item === 'paletteReverse' && typeof parsedValue === 'boolean' && parsedValue !== prev.color.paletteReverse.value
      const next: AppConfig = flipsRange
        ? {
          ...updated,
          color: {
            ...updated.color,
            rangeStart: { ...updated.color.rangeStart, value: Math.round((1 - prev.color.rangeEnd.value) * 1000) / 1000 },
            rangeEnd: { ...updated.color.rangeEnd, value: Math.round((1 - prev.color.rangeStart.value) * 1000) / 1000 },
          },
        }
        : updated
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

  const updateParticleSprites = useCallback(async (sprites: string[]) => {
    const { sprites_MIN: spritesMin, sprites_MAX: spritesMax } = particleConfig
    const deduped = [...new Set(sprites)].slice(0, spritesMax)
    let next = deduped
    if (next.length < spritesMin) {
      const pad = configDefaults.particle.sprites.value[0] ?? 'fractaleye.png'
      next = [...next, ...Array(spritesMin - next.length).fill(pad)].slice(0, spritesMax)
    }
    // Wait for the cache to warm before the particle system rebuild (triggered by the
    // window.config write below) can fire on the next frame -- otherwise a not-yet-cached
    // sprite races a cold cross-origin TextureLoader load against this same fetch.
    await warmSpriteCache(next)
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

  const updateColorList = useCallback((item: 'palette' | 'customStops', values: string[]) => {
    setConfig((prev) => {
      const n: AppConfig = { ...prev, color: { ...prev.color, [item]: { ...prev.color[item], value: values } } }
      window.config = n
      return n
    })
  }, [])

  const updateLogoSprite = useCallback(async (sprite: string) => {
    const chosen = sprite || configDefaults.logo.sprite.value[0] || ''
    await warmSpriteCache([chosen])
    setConfig((prev) => {
      const n: AppConfig = {
        ...prev,
        logo: { ...prev.logo, sprite: { ...prev.logo.sprite, value: [chosen] } },
      }
      window.config = n
      return n
    })
  }, [])

  // Reads window.config (kept in sync with state) so the cap result can be returned synchronously.
  const setLayerEnabled = useCallback((key: LayerKey, enabled: boolean): boolean => {
    const prev = window.config
    const current = prev.layers.meta[key].enabled.value
    if (current === enabled) return true
    const enabledCount = Object.values(prev.layers.meta).filter(m => m.enabled.value).length
    if (enabled && enabledCount >= LAYER_CAP) return false
    const next: AppConfig = {
      ...prev,
      layers: {
        ...prev.layers,
        meta: {
          ...prev.layers.meta,
          [key]: { ...prev.layers.meta[key], enabled: { ...prev.layers.meta[key].enabled, value: enabled } },
        },
      },
    }
    window.config = next
    setConfig(next)
    if (key === 'video') {
      window.dispatchEvent(new CustomEvent('videoClipsRestored', { detail: { clips: enabled ? next.video.clips : [] } }))
    }
    return true
  }, [])

  // Bridge for main.ts's hotkeys (layer toggles, the shockwave switch), which live outside the React tree.
  useEffect(() => {
    window.setLayerEnabled = setLayerEnabled
    window.updateConfigItem = updateConfigItem
    return () => {
      delete window.setLayerEnabled
      delete window.updateConfigItem
    }
  }, [setLayerEnabled, updateConfigItem])

  const setLayerOpacity = useCallback((key: LayerKey, opacity: number) => {
    setConfig((prev) => {
      const { min, max } = prev.layers.meta[key].opacity
      const value = Math.min(Math.max(opacity, min), max)
      const n: AppConfig = {
        ...prev,
        layers: {
          ...prev.layers,
          meta: {
            ...prev.layers.meta,
            [key]: { ...prev.layers.meta[key], opacity: { ...prev.layers.meta[key].opacity, value } },
          },
        },
      }
      window.config = n
      return n
    })
  }, [])

  const moveLayer = useCallback((key: LayerKey, toIndex: number) => {
    setConfig((prev) => {
      const from = prev.layers.order.indexOf(key)
      if (from === -1) return prev
      const order = prev.layers.order.filter(k => k !== key)
      order.splice(Math.min(Math.max(toIndex, 0), order.length), 0, key)
      const n: AppConfig = { ...prev, layers: { ...prev.layers, order } }
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
      // Only (re)create or tear down the video element when clips go on/off, and only while the video layer is
      // enabled (a disabled layer has no element). Dispatching on every checkbox change would restart playback.
      if (!prev.layers.meta.video.enabled.value) return next
      if (!hadClips && hasClips) {
        window.dispatchEvent(new CustomEvent('videoClipsRestored', { detail: { clips } }))
      } else if (hadClips && !hasClips) {
        window.dispatchEvent(new CustomEvent('videoClipsRestored', { detail: { clips: [] } }))
      } else if (hadClips && hasClips) {
        // The list changed while playing: let the layer fade away from a clip that was just unselected.
        window.dispatchEvent(new CustomEvent('videoClipsChanged', { detail: { clips } }))
      }
      return next
    })
  }, [])

  const retrieveConfigPreset = useCallback(async (event: PresetRetrieveEvent) => {
    const name = event.currentTarget?.dataset?.name
    const id = event.currentTarget?.dataset?.id
    if (!name) return

    const cacheKey = id || name

    // The bundled default has no id and ships with the client, so skip the name-keyed localStorage copy: it is seeded once
    // and goes stale whenever the bundled default changes.
    let cfg: Record<string, unknown> | null = name === 'default' && !id ? null : retrieveCachedPreset(cacheKey)

    if (!cfg) {
      if (id) {
        try {
          const result = await axios.get<{ config: Record<string, unknown> }>('/api/preset', { params: { id } })
          cfg = result.data.config
          const stored = localStorage.getItem('presets')
          const cached = stored ? (JSON.parse(stored) as Record<string, unknown>) : {}
          localStorage.setItem('presets', JSON.stringify({ ...cached, [cacheKey]: cfg }))
        } catch {
          cfg = presets[name]?.config ?? null
          if (!cfg) {
            console.error(`Preset "${name}" not found locally or via API`)
            return
          }
          console.warn(`Using bundled preset for "${name}" (offline fallback)`)
          cfg = structuredClone(cfg)
        }
      } else {
        cfg = presets[name]?.config ?? null
        if (!cfg) {
          console.error(`Preset "${name}" not found locally or via API`)
          return
        }
        console.warn(`Using bundled preset for "${name}" (offline fallback)`)
        cfg = structuredClone(cfg)
      }
    }

    // Effective clips: a disabled video layer has no plane, same as an empty clip list.
    const prevClips = window.config.layers.meta.video.enabled.value ? window.config.video.clips : []
    const { config: next, active } = resolveUserReferenceIn(normalizeLoadedPreset(cfg), userContextRef.current)
    activeUserReferenceRef.current = active
    baselineRef.current = next
    // Same reasoning as updateParticleSprites: warm the cache before the config write triggers
    // a rebuild, so a preset's not-yet-cached sprites don't race a cold cross-origin load.
    await warmSpriteCache(next.particle.sprites.value)
    setConfig(next)
    window.config = next
    const nextClips = next.layers.meta.video.enabled.value ? next.video.clips : []
    const sameClips =
      prevClips.length === nextClips.length &&
      prevClips.every((c, i) => c === nextClips[i])
    if (!sameClips) {
      window.dispatchEvent(new CustomEvent('videoClipsRestored', { detail: { clips: nextClips } }))
    }
  }, [retrieveCachedPreset])

  const revertConfig = useCallback((snapshot: AppConfig) => {
    setConfig(snapshot)
    window.config = snapshot
  }, [])

  const resetConfig = useCallback(
    () => retrieveConfigPreset({ currentTarget: { dataset: { name: 'default' } } }),
    [retrieveConfigPreset]
  )

  const resetConfigItem = useCallback((category: ConfigSectionKey, item: string) => {
    const baseItem = Object.entries<ConfigItem>(baselineRef.current[category]).find(([key]) => key === item)?.[1]
    if (!baseItem || Array.isArray(baseItem.value)) return
    updateConfigItem(category, item, baseItem.value)
  }, [updateConfigItem])

  const resetConfigSection = useCallback(async (category: ConfigSectionKey) => {
    const baseline = baselineRef.current
    // Same reasoning as retrieveConfigPreset: warm the sprites before the write triggers a particle rebuild.
    if (category === 'particle') await warmSpriteCache(baseline.particle.sprites.value)
    setConfig((prev) => {
      const next: AppConfig = { ...prev, [category]: baseline[category] }
      window.config = next
      return next
    })
  }, [])

  const resetVideoClips = useCallback(() => {
    updateVideoClips(baselineRef.current.video.clips)
  }, [updateVideoClips])

  // Swaps the active preset's resolved `@user` stand-in back to the sentinel, so a saved preset never stores one user's logo.
  const withUserReference = useCallback((cfg: AppConfig): AppConfig => {
    const resolved = activeUserReferenceRef.current?.resolved ?? null
    if (!resolved) return cfg
    const sprites = restoreUserReference(cfg.particle.sprites.value, resolved)
    return { ...cfg, particle: { ...cfg.particle, sprites: { ...cfg.particle.sprites, value: sprites } } }
  }, [])

  // User data (logo / display name) can land after a preset with `@user` is already active: re-resolve it in place.
  useEffect(() => {
    const active = activeUserReferenceRef.current
    if (!active) return
    const next = resolveUserParticle(userContext, active.presetFallback)
    if (next === active.resolved) return
    const swap = (cfg: AppConfig): AppConfig => ({
      ...cfg,
      particle: {
        ...cfg.particle,
        sprites: { ...cfg.particle.sprites, value: cfg.particle.sprites.value.map(s => (s === active.resolved ? next : s)) },
      },
    })
    activeUserReferenceRef.current = { ...active, resolved: next }
    baselineRef.current = swap(baselineRef.current)
    void warmSpriteCache([next]).then(() => {
      setConfig(prev => {
        const n = swap(prev)
        window.config = n
        return n
      })
    })
  }, [userContext.logoParticle, userContext.displayName])

  const savePreset = useCallback(async (name: string, pack: string, force?: boolean) => {
    const token = await getToken()
    if (!token) throw Object.assign(new Error('Not authenticated'), { response: { status: 401, data: { error: 'Not authenticated — try signing out and back in' } } })
    const { data } = await axios.post<{ id: string; name: string }>('/api/savePreset', {
      name,
      pack,
      config: toStoredConfig(withUserReference(config)),
      force: force ?? false,
    }, {
      headers: { Authorization: `Bearer ${token}` },
    })
    baselineRef.current = config
    const sprite = config.particle.sprites.value[0] ?? 'fractaleye.png'
    const newPreset: PresetMeta = { id: data.id, name: data.name, label: toLabel(data.name), pack, sprite, isOwn: true }
    setPresetList(prev => {
      const matches = (p: PresetMeta): boolean => p.id === data.id || p.name === data.name
      const exists = prev.some(matches)
      return exists ? prev.map(p => (matches(p) ? newPreset : p)) : [...prev, newPreset]
    })
  }, [config, getToken, withUserReference])

  return (
    <ConfigContext.Provider value={{ config, updateConfigItem, updateVideoClips, updateParticleSprites, updateLogoSprite, updateColorList, setLayerEnabled, setLayerOpacity, moveLayer, retrieveConfigPreset, revertConfig, resetConfig, resetConfigItem, resetConfigSection, resetVideoClips, savePreset, isSignedIn: isSignedIn ?? false, currentUserId: user?.id ?? null, getToken, presets: presetList, packs: packList, userSettings, updateUserSettings }}>
      {children}
    </ConfigContext.Provider>
  )
}
