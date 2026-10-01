// Scale slider landmarks for the Julia visualizer, in Scale units (the slider shows value / 1000).
// The visualizer's radius curve and the slider's color zones both read these so they can't drift apart.
export const JULIA_SCALE = {
  min: 0.1,
  // The whole Julia set fills the frame.
  wholeSet: 0.2,
  // Dive, spin and orient turn have finished settling: a still picture from here down.
  settled: 0.3,
  // Roughly where the starting radius reaches the largest value the seamless loop supports (0.2).
  seam: 0.7,
  default: 1.5,
  max: 2,
} as const

export const SCALE_UNITS_PER_SLIDER_STEP = 1000

export type SliderZone = {
  // Upper bound of the zone, in slider units. Zones run from the slider's min up to each bound in order.
  upTo: number
  label: string
  color: string
  // When set, the zone fades from `color` to this color instead of being flat.
  toColor?: string
}

const toUnits = (scale: number): number => Math.round(scale * SCALE_UNITS_PER_SLIDER_STEP)

export const SCALE_ZONES: readonly SliderZone[] = [
  { upTo: toUnits(JULIA_SCALE.wholeSet), label: 'eyeball', color: '#5b3d8f' },
  { upTo: toUnits(JULIA_SCALE.settled), label: 'whole set', color: '#2f6f8f' },
  { upTo: toUnits(JULIA_SCALE.seam), label: 'settling', color: '#2f6f8f', toColor: '#7a7a2f' },
  { upTo: toUnits(JULIA_SCALE.default), label: 'dive', color: '#3d7a3d' },
  { upTo: toUnits(JULIA_SCALE.max), label: 'deeper', color: '#8f4a3d' },
]
