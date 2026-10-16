import {
  AppConfig,
  AudioConfigSection,
  ColorConfigSection,
  ConfigItem,
  EffectsConfigSection,
  FractalConfigSection,
  LayerKey,
  LayersConfigSection,
  LogoConfigSection,
  OrbitConfigSection,
  ParticleConfigSection,
  StoredVideoSection,
  UserConfigSection,
} from './configDefaults'

/** Where the camera pad starts when a preset loads, in pad units (within +/- Sway). Absent means centered. */
export type StoredCamera = { x: number; y: number }

export type StoredLayersSection = {
  order?: LayerKey[]
  meta?: Partial<Record<LayerKey, { enabled?: boolean; opacity?: number }>>
}

type ItemValues<S> = { [K in keyof S]: S[K] extends { value: infer V } ? V : never }

/**
 * What a preset persists: just each item's value. Labels, ranges, steps and the video clip catalog come from
 * `configDefaults` at load time (see normalizeLoadedPreset), so none of that is stored. Every section is optional;
 * the loader fills whatever a preset omits from `configDefaults`.
 */
export type StoredConfig = {
  // The camera pad's starting spot rides along in user; it is not a slider, so the loader reads it separately.
  user?: Partial<ItemValues<UserConfigSection>> & { cameraX?: number; cameraY?: number }
  fractal?: Partial<ItemValues<FractalConfigSection>>
  audio?: Partial<ItemValues<AudioConfigSection>>
  effects?: Partial<ItemValues<EffectsConfigSection>>
  color?: Partial<ItemValues<ColorConfigSection>>
  // Saturation moved to the color section; older presets still carry it here and the loader reads it from there.
  particle?: Partial<ItemValues<ParticleConfigSection>> & { saturation?: number }
  orbit?: Partial<ItemValues<OrbitConfigSection>>
  video?: StoredVideoSection
  logo?: Partial<ItemValues<LogoConfigSection>>
  layers?: StoredLayersSection
}

// Object.fromEntries widens to an index signature, so the one cast lives here instead of at each section.
const valuesOf = <S extends Record<string, ConfigItem>>(section: S): ItemValues<S> =>
  Object.fromEntries(Object.entries(section).map(([key, item]) => [key, item.value])) as ItemValues<S>

const toStoredLayers = ({ order, meta }: LayersConfigSection): StoredLayersSection => ({
  order,
  meta: {
    video: { enabled: meta.video.enabled.value, opacity: meta.video.opacity.value },
    fractal: { enabled: meta.fractal.enabled.value, opacity: meta.fractal.opacity.value },
    orbit: { enabled: meta.orbit.enabled.value, opacity: meta.orbit.opacity.value },
    logo: { enabled: meta.logo.enabled.value, opacity: meta.logo.opacity.value },
  },
})

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

const finiteNumber = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0)

const clampToBound = (v: number, bound: number): number => Math.max(-bound, Math.min(bound, v))

/** The camera a preset starts at: `cameraX`/`cameraY` from its stored user section kept inside Sway, 0 for whichever is missing. */
export const cameraStart = (storedUser: unknown, bound: number): StoredCamera => {
  const { cameraX, cameraY } = isRecord(storedUser) ? storedUser : {}
  return { x: clampToBound(finiteNumber(cameraX), bound), y: clampToBound(finiteNumber(cameraY), bound) }
}

/** Only a camera that is off center, with room to be off center (Sway above 0), is worth storing. */
export const toStoredCamera = (position: StoredCamera | undefined, bound: number): { cameraX: number; cameraY: number } | undefined => {
  if (!position || bound <= 0) return undefined
  const x = Math.round(clampToBound(position.x, bound)) || 0
  const y = Math.round(clampToBound(position.y, bound)) || 0
  return x === 0 && y === 0 ? undefined : { cameraX: x, cameraY: y }
}

/**
 * Sections that belong to a layer that is switched off are left out: the loader keeps whatever the previous preset had
 * for them (see keepDisabledLayerSections), and the layer's enabled flag is still stored in `layers`.
 */
export const toStoredConfig = (config: AppConfig, camera?: StoredCamera): StoredConfig => {
  const { user, fractal, audio, effects, color, particle, orbit, video, logo, layers } = config
  const on = (key: LayerKey): boolean => layers.meta[key].enabled.value
  return {
    user: { ...valuesOf(user), ...toStoredCamera(camera, user.cameraBound.value) },
    ...(on('fractal') && { fractal: valuesOf(fractal) }),
    audio: valuesOf(audio),
    effects: valuesOf(effects),
    color: valuesOf(color),
    ...(on('orbit') && { particle: valuesOf(particle), orbit: valuesOf(orbit) }),
    ...(on('video') && { video: { clips: video.clips, index: video.index } }),
    ...(on('logo') && { logo: valuesOf(logo) }),
    layers: toStoredLayers(layers),
  }
}

const LAYER_SECTIONS: Record<LayerKey, readonly (keyof StoredConfig & keyof AppConfig)[]> = {
  video: ['video'],
  fractal: ['fractal'],
  orbit: ['orbit', 'particle'],
  logo: ['logo'],
}

/**
 * A preset that leaves out a switched-off layer's sections keeps the current config's values for them, so switching
 * presets does not wipe what was tuned for a layer and switching it back on finds it as it was.
 */
export const keepDisabledLayerSections = (next: AppConfig, stored: Record<string, unknown>, previous: AppConfig): AppConfig =>
  (Object.keys(LAYER_SECTIONS) as LayerKey[]).reduce(
    (acc, key) =>
      next.layers.meta[key].enabled.value
        ? acc
        : LAYER_SECTIONS[key].reduce((a, section) => (stored[section] === undefined ? { ...a, [section]: previous[section] } : a), acc),
    next,
  )
