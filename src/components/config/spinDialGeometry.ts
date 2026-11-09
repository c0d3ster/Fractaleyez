// The spin dial is drawn in a square of this many units, centered on 0.
export const VIEW = 100
export const HALF = VIEW / 2

// Radii, in those units: the bearing's ring at the rim, the speed gauge's arc inside it, and the hub in the middle.
export const RING_RADIUS = 44
export const ARC_RADIUS = 23
// A press at or beyond this radius grabs the bearing; inside it (down to the hub) it grabs the speed.
export const RING_INNER = 34
export const HUB_RADIUS = 10

/** The gauge sweeps this far either side of straight up (0 speed is at the top), leaving a gap at the bottom. */
export const SWEEP = (135 * Math.PI) / 180

export type SpinRange = { min: number, max: number, step: number }
export type DialRegion = 'ring' | 'speed' | 'hub'

const snap = (value: number, step: number): number => Math.round(value / step) * step

/** A point on a circle of `radius`, at `angle` radians clockwise from straight up. */
export const pointAt = (radius: number, angle: number): { x: number, y: number } => ({
  x: radius * Math.sin(angle),
  y: -radius * Math.cos(angle),
})

/** The gauge angle of a speed: 0 at the top, the maximum at +SWEEP (clockwise), the minimum at -SWEEP. */
export const speedToAngle = (speed: number, { min, max }: SpinRange): number => {
  if (speed >= 0) return max > 0 ? Math.min(1, speed / max) * SWEEP : 0
  return min < 0 ? -Math.min(1, speed / min) * SWEEP : 0
}

/** The speed a gauge angle (radians clockwise from up, any turn) stands for, snapped to the step and kept in range. */
export const angleToSpeed = (angle: number, range: SpinRange): number => {
  const { min, max, step } = range
  const wrapped = Math.atan2(Math.sin(angle), Math.cos(angle))
  // The gap at the bottom goes to whichever end is nearer, which is the side the pointer is on.
  const along = Math.max(-SWEEP, Math.min(SWEEP, wrapped)) / SWEEP
  const raw = along >= 0 ? along * max : -along * min
  // Rounded away the float noise a step like 0.1 leaves (0.30000000000000004).
  const snapped = Number(snap(raw, step).toFixed(6))
  return Math.max(min, Math.min(max, snapped))
}

/** What a press at `radius` units from the center grabs. */
export const regionAt = (radius: number): DialRegion => {
  if (radius >= RING_INNER) return 'ring'
  return radius >= HUB_RADIUS ? 'speed' : 'hub'
}

/** An SVG path along a circle of `radius` from one angle to another (radians clockwise from up), or '' when there is no length. */
export const arcPath = (radius: number, from: number, to: number): string => {
  if (from === to) return ''
  const start = pointAt(radius, from)
  const end = pointAt(radius, to)
  const largeArc = Math.abs(to - from) > Math.PI ? 1 : 0
  const clockwise = to > from ? 1 : 0
  return `M ${start.x.toFixed(3)} ${start.y.toFixed(3)} A ${radius} ${radius} 0 ${largeArc} ${clockwise} ${end.x.toFixed(3)} ${end.y.toFixed(3)}`
}

/** A speed as the dial's center text: no trailing zeros, at most two decimals. */
export const formatSpeed = (speed: number): string => String(Math.round(speed * 100) / 100)

// The gauge is drawn in short pieces, each colored by how hard it is spinning there.
const SEGMENT = (4 * Math.PI) / 180
// Pieces reach a hair past their end so no seam shows between them.
const SEGMENT_OVERLAP = (0.6 * Math.PI) / 180

export type GaugeSegment = { d: string, intensity: number }

/** The short pieces of the gauge between two angles, each with how far out it is (0 at the top, 1 at an end). */
export const gaugeSegments = (radius: number, from: number, to: number): GaugeSegment[] => {
  const direction = to >= from ? 1 : -1
  const count = Math.ceil(Math.abs(to - from) / SEGMENT)
  return Array.from({ length: count }, (_, i) => {
    const start = from + direction * i * SEGMENT
    const end = i === count - 1 ? to : start + direction * (SEGMENT + SEGMENT_OVERLAP)
    return { d: arcPath(radius, start, end), intensity: Math.min(1, Math.abs((start + end) / 2) / SWEEP) }
  })
}

/** Green at rest, yellow halfway, red flat out. */
export const intensityColor = (intensity: number): string => `hsl(${Math.round(120 * (1 - Math.max(0, Math.min(1, intensity))))} 68% 50%)`
