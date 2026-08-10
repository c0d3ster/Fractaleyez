export const visualizerConfig = {
  cyclone: true,
  wobwob: true,
  switcheroo: true,
  colorShift: true,
  glow: true,
  shockwave: true,
} as const

/** Default crossfade duration (ms) used when Particle Config or Orbit Config changes force a particle-system rebuild. */
export const PARTICLE_CROSSFADE_DURATION_MS = 750

/**
 * Max particle-system generations allowed alive at once during a crossfade -- 1 current
 * (incoming) generation plus up to this-many-minus-1 older generations still fading out.
 * Applies to both the Particle Config crossfade (HopalongManager) and the Orbit Config
 * crossfade (HopalongVisualizer). Once a new change would exceed this cap, the oldest
 * still-fading generation is force-finished immediately to make room.
 */
export const MAX_CROSSFADE_GENERATIONS = 4
