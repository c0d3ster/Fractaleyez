import React, { useState, useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import axios from 'axios'
import { useAuth, useUser } from '@clerk/clerk-react'

import { cameraStart, keepDisabledLayerSections, toStoredConfig } from '../../../config/storedConfig'
import { AppConfig, ConfigItem, LayerKey, ParticleConfigSection, configDefaults } from '../../../config/configDefaults'
import { LAYER_CAP } from '../../../config/layers'
import { mergeLayers, presentLayers } from '../../../config/mergeLayers'
import { particleConfig } from '../../../config/particle.config'
import { getResolvedSpriteUrl, warmSpriteCache } from '../../../utils/spriteCache'
import { ApiPack, ApiPreset, readPresetListCache, updatePresetListCache } from '../../../utils/presetListCache'
import { isCurrent, readCachedPresetBody, writeCachedPresetBody } from '../../../utils/presetBodyCache'
import { FocusPoint, loadZoomFocus } from '../../../utils/zoomFocus'
import { persistClerkPhotoAsLogo } from '../../../utils/clerkPhotoLogo'
import {
  resolveUserParticle,
  resolveUserSprites,
  restoreUserReference,
  swapUserReference,
  USER_REFERENCE,
  UserReferenceContext,
  UserReferenceState,
} from '../../../utils/userReference'
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
  updatedAt?: string | null
}

export type PackMeta = {
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
  isAdmin?: boolean
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

const toPresetMeta = (p: ApiPreset): PresetMeta => ({ ...p, label: toLabel(p.name) })

/** The default preset is configDefaults, so it is in the list even with no cache and no API. It has no id: it loads without a fetch. */
const DEFAULT_PRESET_META: PresetMeta = {
  name: 'default',
  label: toLabel('default'),
  pack: 'Essentials',
  sprite: configDefaults.particle.sprites.value[0] ?? 'fractaleye.png',
  isOwn: false,
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
    layers: mergeLayers(cfg.layers, presentLayers(cfg, video.clips.length)),
    logo: mergeConfigSection('logo', cfg.logo as Record<string, unknown> | undefined),
  }
}

/** Aims the logo's zoom at a point of its image. */
const withLogoFocus = (cfg: AppConfig, { x, y }: FocusPoint): AppConfig => ({
  ...cfg,
  logo: { ...cfg.logo, focusX: { ...cfg.logo.focusX, value: x }, focusY: { ...cfg.logo.focusY, value: y } },
})

/** Aims the logo's zoom at the point its current image suggests. */
const withSuggestedLogoFocus = async (cfg: AppConfig): Promise<AppConfig> => {
  const [sprite] = cfg.logo.sprite.value
  return sprite ? withLogoFocus(cfg, await loadZoomFocus(getResolvedSpriteUrl(sprite))) : cfg
}

/** The live `@user` stand-in for one sprite list, kept so it can be re-resolved when user data arrives and un-resolved on save. */
type ActiveUserReference = UserReferenceState & { presetFallback: string | undefined }

/** The sprite lists that can hold `@user`: the particle list and the logo layer's single-item list. */
export type UserReferenceSlot = 'particle' | 'logo'
type ActiveUserReferences = Partial<Record<UserReferenceSlot, ActiveUserReference>>

const USER_REFERENCE_SLOTS: UserReferenceSlot[] = ['particle', 'logo']

const slotSprites = (cfg: AppConfig, slot: UserReferenceSlot): string[] =>
  slot === 'particle' ? cfg.particle.sprites.value : cfg.logo.sprite.value

const withSlotSprites = (cfg: AppConfig, slot: UserReferenceSlot, value: string[]): AppConfig =>
  slot === 'particle'
    ? { ...cfg, particle: { ...cfg.particle, sprites: { ...cfg.particle.sprites, value } } }
    : { ...cfg, logo: { ...cfg.logo, sprite: { ...cfg.logo.sprite, value } } }

const userReferenceStandInOf = (cfg: AppConfig, active: ActiveUserReferences, slot: UserReferenceSlot): string | null => {
  const resolved = active[slot]?.resolved
  return resolved !== undefined && slotSprites(cfg, slot).includes(resolved) ? resolved : null
}

/** Resolves a normalized preset's `@user` references (particle and logo lists) against the current user (load time, never save time). */
const resolveUserReferenceIn = (
  cfg: AppConfig,
  context: UserReferenceContext,
): { config: AppConfig; active: ActiveUserReferences } => {
  let config = cfg
  const active: ActiveUserReferences = {}
  for (const slot of USER_REFERENCE_SLOTS) {
    const list = slotSprites(cfg, slot)
    const { sprites, reference } = resolveUserSprites(list, context)
    if (!reference) continue
    // The logo list holds one sprite with no sibling to fall back to, so its fallback is undefined and the chain ends at the app default.
    config = withSlotSprites(config, slot, slot === 'particle' ? normalizeParticleSpritesValue(sprites) : sprites)
    active[slot] = { ...reference, presetFallback: list.find(s => s !== USER_REFERENCE) }
  }
  return { config, active }
}

export type ConfigContextValue = {
  config: AppConfig
  updateConfigItem: (category: string, item: string, value: string | boolean | number) => void
  updateVideoClips: (clips: string[]) => void
  updateParticleSprites: (sprites: string[]) => Promise<void>
  updateLogoSprite: (sprite: string) => Promise<void>
  /** Admin tool: puts `@user` in a sprite list. It renders as the viewer's own logo and is restored to the sentinel on save. */
  applyUserReference: (slot: UserReferenceSlot) => Promise<void>
  /** Drops the live `@user` reference so the stand-in saves as a plain sprite; with `remove`, also takes the stand-in out of the particle list. */
  releaseUserReference: (slot: UserReferenceSlot, options?: { remove?: boolean }) => Promise<void>
  /** Per slot: the live `@user` stand-in URL while it is still in the list, else null. The pickers draw it as a literal "@user" square. */
  userReferenceStandIn: Record<UserReferenceSlot, string | null>
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
  /** From `/api/me`. Only hides admin-only UI; the server enforces it on save. False until the load lands or when signed out. */
  isAdmin: boolean
  /** The viewer's resolved `@user` sprite (logo, else display name, else app default), for preset list thumbnails. */
  userSprite: string
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
  const { isSignedIn, isLoaded, user } = useUser()
  // Who the preset and pack lists belong to; null is signed out. Only meaningful once Clerk has loaded.
  const viewerId = isSignedIn ? (user?.id ?? null) : null

  // configDefaults is the default look (every layer on), so the first frame needs nothing from the API.
  const [config, setConfig] = useState<AppConfig>(() => {
    const initial = structuredClone(configDefaults)
    window.config = initial
    return initial
  })

  // Values the active preset had when it loaded (or was last saved); the target of per-item and per-section reset.
  const baselineRef = useRef<AppConfig>(config)

  const [presetList, setPresetList] = useState<PresetMeta[]>([])
  const presetListRef = useRef(presetList)
  presetListRef.current = presetList
  const [packList, setPackList] = useState<PackMeta[]>([])
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null)
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const userContext: UserReferenceContext = { logoParticle: userSettings?.logoParticle, displayName }
  // What `@user` looks like for this viewer with no preset fallback; preset list thumbnails use it.
  const userSprite = useMemo(
    () => resolveUserParticle({ logoParticle: userSettings?.logoParticle, displayName }, undefined),
    [userSettings?.logoParticle, displayName],
  )
  const userContextRef = useRef(userContext)
  userContextRef.current = userContext
  const activeUserReferenceRef = useRef<ActiveUserReferences>({})
  // The reference lives in a ref; releasing one changes no config, so this nudges the selected state to re-read it.
  const [, rerender] = useReducer((n: number) => n + 1, 0)
  const clerkPhotoAttemptedForRef = useRef<string | null>(null)
  const pendingSettingsPatchRef = useRef<Partial<UserSettings>>({})
  const settingsSaveTimerRef = useRef<number | null>(null)

  useEffect(() => {
    void warmSpriteCache(window.config.particle.sprites.value)
  }, [])

  // Shows the last lists this viewer saw while the live fetch is out. Another viewer's lists are never shown, so a viewer
  // change starts empty. Declared before the fetches below so a fetch that lands later wins.
  useEffect(() => {
    if (!isLoaded) return
    const cached = readPresetListCache(viewerId)
    setPresetList(cached ? cached.presets.map(toPresetMeta) : [])
    setPackList(cached ? cached.packs : [])
  }, [isLoaded, viewerId])

  useEffect(() => {
    if (!isLoaded) return undefined
    let cancelled = false
    const load = async (): Promise<void> => {
      try {
        const token = await getToken()
        const { data } = await axios.get<ApiPreset[]>('/api/presets', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        if (cancelled) return
        setPresetList(data.map(toPresetMeta))
        updatePresetListCache(viewerId, { presets: data })
      } catch (err) {
        console.error('Failed to load presets from API, keeping the cached list', err)
        if (cancelled) return
        setPresetList(prev => (prev.length > 0 ? prev : [DEFAULT_PRESET_META]))
      }
    }
    void load()
    return () => { cancelled = true }
  }, [getToken, isLoaded, viewerId])

  useEffect(() => {
    if (!isLoaded) return undefined
    let cancelled = false
    const load = async (): Promise<void> => {
      try {
        const token = await getToken()
        const { data } = await axios.get<ApiPack[]>('/api/packs', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        if (cancelled) return
        setPackList(data)
        updatePresetListCache(viewerId, { packs: data })
      } catch (err) {
        console.error('Failed to load packs, keeping the cached list', err)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [getToken, isLoaded, viewerId])

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
        setIsAdmin(data.isAdmin === true)
        applyUserSettingsSideEffects(data.settings)

        // Only when no logo is set yet: persist a sprite-processed copy of the Clerk social photo as the
        // user's logoParticle, so the `@user` resolver's per-user-settings rung already covers it.
        if (data.settings.logoParticle || clerkPhotoAttemptedForRef.current === user?.id || !user?.hasImage) return
        clerkPhotoAttemptedForRef.current = user.id
        const url = await persistClerkPhotoAsLogo(user.imageUrl, token)
        if (cancelled || !url || userContextRef.current.logoParticle) return
        updateUserSettings({ logoParticle: url })
      } catch (err) {
        console.error('Failed to load /api/me', err)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [isSignedIn, getToken, user?.id])

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
    // Picking a logo aims its zoom at the point the image suggests; the pad's dot adjusts it from there, and a saved preset keeps what was set.
    const focus = await loadZoomFocus(getResolvedSpriteUrl(chosen))
    setConfig((prev) => {
      const n = withLogoFocus(
        { ...prev, logo: { ...prev.logo, sprite: { ...prev.logo.sprite, value: [chosen] } } },
        focus,
      )
      window.config = n
      return n
    })
  }, [])

  const applyUserReference = useCallback(async (slot: UserReferenceSlot): Promise<void> => {
    const current = slotSprites(window.config, slot)
    const others = current.filter(s => s !== USER_REFERENCE)
    const { sprites, reference } = resolveUserSprites(slot === 'particle' ? [...others, USER_REFERENCE] : [USER_REFERENCE], userContextRef.current)
    if (!reference) return
    activeUserReferenceRef.current = {
      ...activeUserReferenceRef.current,
      [slot]: { ...reference, presetFallback: slot === 'particle' ? others[0] : undefined },
    }
    if (slot === 'particle') await updateParticleSprites(sprites)
    else await updateLogoSprite(sprites[0] ?? '')
  }, [updateParticleSprites, updateLogoSprite])

  const releaseUserReference = useCallback(async (slot: UserReferenceSlot, { remove = false }: { remove?: boolean } = {}): Promise<void> => {
    const reference = activeUserReferenceRef.current[slot]
    if (!reference) return
    activeUserReferenceRef.current = { ...activeUserReferenceRef.current, [slot]: undefined }
    const current = slotSprites(window.config, slot)
    if (remove && slot === 'particle' && current.length > particleConfig.sprites_MIN) {
      await updateParticleSprites(current.filter(s => s !== reference.resolved))
      return
    }
    rerender()
  }, [updateParticleSprites])

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

    // The default preset is configDefaults: no id, nothing to fetch, nothing to go stale. Every other preset is cached by id with the
    // updatedAt it had when fetched, and a copy the list says has changed is fetched again.
    const listed = id ? presetListRef.current.find(p => p.id === id) : undefined
    const cached = id ? readCachedPresetBody(id) : null
    let cfg: Record<string, unknown> | null = cached && isCurrent(cached, listed?.updatedAt)
      ? cached.config
      : !id && name === 'default' ? toStoredConfig(configDefaults) : null

    if (!cfg) {
      if (!id) {
        console.error(`Preset "${name}" has no id and is not the default`)
        return
      }
      try {
        const result = await axios.get<{ config: Record<string, unknown>; updatedAt?: string }>('/api/preset', { params: { id } })
        cfg = result.data.config
        writeCachedPresetBody(id, { config: cfg, updatedAt: result.data.updatedAt ?? null })
      } catch (err) {
        // Offline (or the API is down): an out-of-date copy beats none.
        if (!cached) {
          console.error(`Preset "${name}" is not cached and the API is unreachable`, err)
          return
        }
        console.warn(`Using the cached copy of "${name}" (could not check for a newer one)`)
        cfg = cached.config
      }
    }

    // Effective clips: a disabled video layer has no plane, same as an empty clip list.
    const prevClips = window.config.layers.meta.video.enabled.value ? window.config.video.clips : []
    const loaded = keepDisabledLayerSections(normalizeLoadedPreset(cfg), cfg, window.config)
    const { config: resolved, active } = resolveUserReferenceIn(loaded, userContextRef.current)
    // A stored focus belongs to the image it was set on, and an `@user` logo is a different image for every viewer.
    const next = active.logo ? await withSuggestedLogoFocus(resolved) : resolved
    activeUserReferenceRef.current = active
    baselineRef.current = next
    // Same reasoning as updateParticleSprites: warm the cache before the config write triggers
    // a rebuild, so a preset's not-yet-cached sprites don't race a cold cross-origin load.
    await warmSpriteCache([...next.particle.sprites.value, ...next.logo.sprite.value])
    setConfig(next)
    window.config = next
    // A preset only stores a camera when it starts off center, so one without it puts the camera back in the middle.
    const camera = cameraStart(cfg.user, next.user.cameraBound.value)
    window.setVirtualCameraPosition?.(camera.x, camera.y)
    const nextClips = next.layers.meta.video.enabled.value ? next.video.clips : []
    const sameClips =
      prevClips.length === nextClips.length &&
      prevClips.every((c, i) => c === nextClips[i])
    if (!sameClips) {
      window.dispatchEvent(new CustomEvent('videoClipsRestored', { detail: { clips: nextClips } }))
    }
  }, [])

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
  const userReferenceStandIn: Record<UserReferenceSlot, string | null> = {
    particle: userReferenceStandInOf(config, activeUserReferenceRef.current, 'particle'),
    logo: userReferenceStandInOf(config, activeUserReferenceRef.current, 'logo'),
  }

  const withUserReference = useCallback((cfg: AppConfig): AppConfig => {
    const active = activeUserReferenceRef.current
    return USER_REFERENCE_SLOTS.reduce((acc, slot) => {
      const reference = active[slot]
      return reference ? withSlotSprites(acc, slot, restoreUserReference(slotSprites(acc, slot), reference)) : acc
    }, cfg)
  }, [])

  // User data (logo / display name) can land after a preset with `@user` is already active: re-resolve it in place.
  useEffect(() => {
    const active = activeUserReferenceRef.current
    const changed: { slot: UserReferenceSlot; reference: ActiveUserReference; next: string }[] = []
    const updated: ActiveUserReferences = {}
    for (const slot of USER_REFERENCE_SLOTS) {
      const reference = active[slot]
      if (!reference) continue
      const next = resolveUserParticle(userContext, reference.presetFallback)
      if (next === reference.resolved) {
        updated[slot] = reference
        continue
      }
      updated[slot] = { ...reference, ...swapUserReference(slotSprites(baselineRef.current, slot), reference, next).reference }
      changed.push({ slot, reference, next })
    }
    if (changed.length === 0) return
    const swap = (cfg: AppConfig): AppConfig =>
      changed.reduce(
        (acc, { slot, reference, next }) => withSlotSprites(acc, slot, swapUserReference(slotSprites(acc, slot), reference, next).sprites),
        cfg,
      )
    activeUserReferenceRef.current = updated
    baselineRef.current = swap(baselineRef.current)
    const logoNext = changed.find(c => c.slot === 'logo')?.next
    void warmSpriteCache(changed.map(c => c.next)).then(async () => {
      // The viewer's logo just landed (or changed): aim the zoom at the point it suggests, as at preset load.
      const focus = logoNext === undefined ? undefined : await loadZoomFocus(getResolvedSpriteUrl(logoNext))
      if (focus) baselineRef.current = withLogoFocus(baselineRef.current, focus)
      setConfig(prev => {
        const swapped = swap(prev)
        const n = focus ? withLogoFocus(swapped, focus) : swapped
        window.config = n
        return n
      })
    })
  }, [userContext.logoParticle, userContext.displayName])

  const savePreset = useCallback(async (name: string, pack: string, force?: boolean) => {
    const token = await getToken()
    if (!token) throw Object.assign(new Error('Not authenticated'), { response: { status: 401, data: { error: 'Not authenticated — try signing out and back in' } } })
    const storedConfig = toStoredConfig(withUserReference(config), window.getVirtualCameraPosition?.())
    const { data } = await axios.post<{ id: string; name: string; updatedAt?: string | null }>('/api/savePreset', {
      name,
      pack,
      config: storedConfig,
      force: force ?? false,
    }, {
      headers: { Authorization: `Bearer ${token}` },
    })
    baselineRef.current = config
    const sprite = config.particle.sprites.value[0] ?? 'fractaleye.png'
    const updatedAt = data.updatedAt ?? null
    const newPreset: PresetMeta = { id: data.id, name: data.name, label: toLabel(data.name), pack, sprite, isOwn: true, updatedAt }
    // What was just saved is current: keep it so opening this preset needs no request.
    writeCachedPresetBody(data.id, { config: storedConfig, updatedAt })
    const matches = (p: PresetMeta): boolean => p.id === data.id || p.name === data.name
    const prev = presetListRef.current
    const next = prev.some(matches) ? prev.map(p => (matches(p) ? newPreset : p)) : [...prev, newPreset]
    setPresetList(next)
    // Keep the cached list current, so a reload with the API down still shows what was just saved.
    updatePresetListCache(viewerId, {
      presets: next.flatMap(({ id, name: presetName, pack: presetPack, sprite: presetSprite, isOwn, updatedAt: presetUpdatedAt }) =>
        id ? [{ id, name: presetName, pack: presetPack, sprite: presetSprite, isOwn, updatedAt: presetUpdatedAt ?? null }] : []),
    })
  }, [config, getToken, withUserReference, viewerId])

  return (
    <ConfigContext.Provider value={{ config, updateConfigItem, updateVideoClips, updateParticleSprites, updateLogoSprite, applyUserReference, releaseUserReference, userReferenceStandIn, updateColorList, setLayerEnabled, setLayerOpacity, moveLayer, retrieveConfigPreset, revertConfig, resetConfig, resetConfigItem, resetConfigSection, resetVideoClips, savePreset, isSignedIn: isSignedIn ?? false, currentUserId: user?.id ?? null, getToken, presets: presetList, packs: packList, userSettings, isAdmin: isSignedIn === true && isAdmin, userSprite, updateUserSettings }}>
      {children}
    </ConfigContext.Provider>
  )
}
