import { SliderZone } from './juliaScale.config'

// Particle load is the total point count (particlesPerLayer x layers x levels), nudged up by sprite size.
// Points dominate: they set how heavy a preset swap is. Size is a mild multiplier because big sprites
// cost less than their pixel size suggests (distance attenuation, driver point-size caps).
// Calibrated so every bundled preset sits below the red zone and the point-heavy ones (colorPortal,
// pointerz, dispersionTunnelSpin, squareMandala, circles, crossheirSpin) land in the heavy zone.
export const PARTICLE_LOAD_HEAVY = 300_000
export const PARTICLE_LOAD_RED = 750_000
// Load grows by 1x per this many size units, so doubling size adds well under 2x load at normal sizes.
export const PARTICLE_SIZE_LOAD_DIVISOR = 100

export type ParticleLoadInputs = {
  particlesPerLayer: number
  layers: number
  levels: number
  particleSize: number
}

export type ParticleLoadKey = keyof ParticleLoadInputs

const LOAD_KEYS: readonly ParticleLoadKey[] = ['particlesPerLayer', 'layers', 'levels', 'particleSize']

export const isParticleLoadKey = (key: string): key is ParticleLoadKey => LOAD_KEYS.some((loadKey) => loadKey === key)

export const particleLoad = ({ particlesPerLayer, layers, levels, particleSize }: ParticleLoadInputs): number =>
  particlesPerLayer * layers * levels * (1 + particleSize / PARTICLE_SIZE_LOAD_DIVISOR)

export const totalParticles = ({ particlesPerLayer, layers, levels }: ParticleLoadInputs): number =>
  particlesPerLayer * layers * levels

// Largest value of `key` in [min, max] that keeps the load at or under `limit`, holding the other inputs
// fixed. Load only grows with each input, so a binary search works. Returns min - 1 if even min is over.
export const maxValueUnderLoad = (inputs: ParticleLoadInputs, key: ParticleLoadKey, limit: number, min: number, max: number): number => {
  let low = min - 1
  let high = max
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    if (particleLoad({ ...inputs, [key]: mid }) <= limit) low = mid
    else high = mid - 1
  }
  return low
}

const ZONE_COLORS = {
  safe: '#56705a',
  heavy: '#8a7d52',
  red: '#8a5552',
} as const

// Color zones for one load slider: where the others currently sit decides where this one turns heavy and red.
export const particleLoadZones = (inputs: ParticleLoadInputs, key: ParticleLoadKey, min: number, max: number): readonly SliderZone[] => {
  const heavyUpTo = maxValueUnderLoad(inputs, key, PARTICLE_LOAD_HEAVY, min, max)
  const redUpTo = maxValueUnderLoad(inputs, key, PARTICLE_LOAD_RED, min, max)
  const zones: readonly SliderZone[] = [
    { upTo: heavyUpTo, color: ZONE_COLORS.safe },
    { upTo: redUpTo, color: ZONE_COLORS.heavy },
    { upTo: max, color: ZONE_COLORS.red },
  ]
  // A zone that ends before the slider's min, or at the same spot as the one before it, is never reachable.
  return zones.filter(({ upTo }, index) => upTo >= min && (index === 0 || upTo > (zones[index - 1]?.upTo ?? min - 1)))
}
