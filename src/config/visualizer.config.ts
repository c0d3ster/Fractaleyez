export const visualizerConfig = {
  cyclone: true,
  wobwob: true,
  switcheroo: true,
  colorShift: true,
  glow: true,
  shockwave: true,
} as const

/** Default crossfade duration (ms) used when Particle Config or Orbit Config changes force a particle-system rebuild. */
export const PARTICLE_CROSSFADE_DURATION_DEFAULT_MS = 750
export const PARTICLE_CROSSFADE_DURATION_MIN_MS = 0
export const PARTICLE_CROSSFADE_DURATION_MAX_MS = 5000

// Mutable, not a plain const: the config-gear user setting overrides this at runtime (see
// ConfigProvider's /api/me load), same "poll a live value each frame" pattern OrbitLayer/
// HopalongVisualizer already use for window.config -- a fixed const couldn't be user-configurable
// without threading it through every call site as a parameter instead.
let particleCrossfadeDurationMs = PARTICLE_CROSSFADE_DURATION_DEFAULT_MS

export const getParticleCrossfadeDurationMs = (): number => particleCrossfadeDurationMs

export const setParticleCrossfadeDurationMs = (ms: number): void => {
  if (!Number.isFinite(ms)) return
  particleCrossfadeDurationMs = Math.min(PARTICLE_CROSSFADE_DURATION_MAX_MS, Math.max(PARTICLE_CROSSFADE_DURATION_MIN_MS, ms))
}

/**
 * Max particle-system generations allowed alive at once during a crossfade -- 1 current
 * (incoming) generation plus up to this-many-minus-1 older generations still fading out.
 * Applies to both the Particle Config crossfade (OrbitLayer) and the Orbit Config
 * crossfade (HopalongVisualizer). Once a new change would exceed this cap, the oldest
 * still-fading generation is force-finished immediately to make room.
 */
export const MAX_CROSSFADE_GENERATIONS = 4

/**
 * How far the camera pointer shifts the on-screen focal point of the Julia visualizer (and where the
 * Hopalong shockwave starts), in screen fractions per Camera Position pad unit: 0.4 of the frame at the
 * pad's maximum range of 500, so the default range of 100 only reaches 0.08 off center.
 */
export const CAMERA_STEER_SCREEN_FRACTION_PER_PAD_UNIT = 0.4 / 500
