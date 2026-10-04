import {
  AppConfig,
  AudioConfigSection,
  ConfigItem,
  EffectsConfigSection,
  FractalConfigSection,
  LogoConfigSection,
  OrbitConfigSection,
  ParticleConfigSection,
  StoredVideoSection,
  UserConfigSection,
} from './configDefaults'

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
  particle?: Partial<ItemValues<ParticleConfigSection>>
  orbit?: Partial<ItemValues<OrbitConfigSection>>
  video?: StoredVideoSection
  logo?: Partial<ItemValues<LogoConfigSection>>
}

// Object.fromEntries widens to an index signature, so the one cast lives here instead of at each section.
const valuesOf = <S extends Record<string, ConfigItem>>(section: S): ItemValues<S> =>
  Object.fromEntries(Object.entries(section).map(([key, item]) => [key, item.value])) as ItemValues<S>

export const toStoredConfig = ({ user, fractal, audio, effects, particle, orbit, video, logo }: AppConfig): StoredConfig => ({
  user: valuesOf(user),
  fractal: valuesOf(fractal),
  audio: valuesOf(audio),
  effects: valuesOf(effects),
  particle: valuesOf(particle),
  orbit: valuesOf(orbit),
  video: { clips: video.clips, index: video.index },
  logo: valuesOf(logo),
})
