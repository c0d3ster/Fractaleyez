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
  user?: Partial<ItemValues<UserConfigSection>>
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

export const toStoredConfig = ({ user, fractal, audio, effects, color, particle, orbit, video, logo, layers }: AppConfig): StoredConfig => ({
  user: valuesOf(user),
  fractal: valuesOf(fractal),
  audio: valuesOf(audio),
  effects: valuesOf(effects),
  color: valuesOf(color),
  particle: valuesOf(particle),
  orbit: valuesOf(orbit),
  video: { clips: video.clips, index: video.index },
  logo: valuesOf(logo),
  layers: toStoredLayers(layers),
})
