// Pure touch gesture classification for the mobile shell: pointer positions in, gesture kind and deltas out. The controller
// (touchController.ts) feeds it pointer events; everything here can be tuned and tested without a phone.

export type Point = { x: number; y: number }
export type PointerTrack = { start: Point; current: Point }
export type GestureKind = 'steer' | 'speed' | 'scale' | 'rotation' | 'none'
export type TwoFingerKind = Exclude<GestureKind, 'steer'>
export type GestureReading = { kind: GestureKind; delta: number }

/** True: rotation is a two-finger twist. False: rotation is a two-finger sideways drag (flip after phone testing if twist and pinch get confused). */
export const ROTATION_BY_TWIST = true

/** Pixels the two-finger motion must reach (in its largest measure) before a kind is chosen. */
export const TWO_FINGER_DEAD_ZONE_PX = 18
/** A press that moves less than this and lifts within TAP_MAX_MS is a tap. */
export const TAP_SLOP_PX = 10
export const TAP_MAX_MS = 250
/** The second tap must land within this many ms of the first one's release, and within this distance of it. */
export const DOUBLE_TAP_MS = 300
export const DOUBLE_TAP_SLOP_PX = 40

/** Speed units per pixel of shared vertical motion (up is faster). */
export const SPEED_PER_PX = 0.03
/** Scale units per pixel of change in the gap between the fingers (spreading zooms in). */
export const SCALE_PER_PX = 3
/** Rotation units per radian of twist. */
export const ROTATION_PER_RAD = 6
/** Rotation units per pixel of shared sideways motion (only when ROTATION_BY_TWIST is false). Right is positive. */
export const ROTATION_PER_PX = 0.04

const distance = (a: Point, b: Point): number => Math.hypot(b.x - a.x, b.y - a.y)
const angle = (a: Point, b: Point): number => Math.atan2(b.y - a.y, b.x - a.x)

/** The signed change from `from` to `to` in radians, wrapped into (-π, π], so a twist across the ±π line reads as small. */
export const angleDelta = (from: number, to: number): number => {
  const raw = to - from
  const wrapped = raw - 2 * Math.PI * Math.floor((raw + Math.PI) / (2 * Math.PI))
  return wrapped === -Math.PI ? Math.PI : wrapped
}

/** The measures of a two-finger motion since it started. `vertical` is positive when both fingers move up; `twist` is radians. */
export type TwoFingerMotion = { vertical: number; sideways: number; gap: number; twist: number; twistArc: number }

export const measureTwoFinger = (a: PointerTrack, b: PointerTrack): TwoFingerMotion => {
  const vertical = -((a.current.y - a.start.y) + (b.current.y - b.start.y)) / 2
  const sideways = ((a.current.x - a.start.x) + (b.current.x - b.start.x)) / 2
  const startGap = distance(a.start, b.start)
  const gap = distance(a.current, b.current) - startGap
  const twist = angleDelta(angle(a.start, b.start), angle(a.current, b.current))
  // The twist as distance travelled by each finger around the midpoint, so it compares with the other measures in pixels.
  const twistArc = twist * ((startGap + distance(a.current, b.current)) / 4)
  return { vertical, sideways, gap, twist, twistArc }
}

/** The value change a two-finger kind asks for, from its motion. */
export const twoFingerDelta = (kind: TwoFingerKind, motion: TwoFingerMotion, rotationByTwist = ROTATION_BY_TWIST): number => {
  if (kind === 'speed') return motion.vertical * SPEED_PER_PX
  if (kind === 'scale') return motion.gap * SCALE_PER_PX
  if (kind === 'rotation') return rotationByTwist ? motion.twist * ROTATION_PER_RAD : motion.sideways * ROTATION_PER_PX
  return 0
}

/** Which kind a two-finger motion is: the measure that changed most, once it is past the dead zone, else 'none'. */
export const classifyTwoFinger = (motion: TwoFingerMotion, rotationByTwist = ROTATION_BY_TWIST): TwoFingerKind => {
  const candidates: [TwoFingerKind, number][] = [
    ['speed', Math.abs(motion.vertical)],
    ['scale', Math.abs(motion.gap)],
    ['rotation', Math.abs(rotationByTwist ? motion.twistArc : motion.sideways)],
  ]
  const [kind, size] = candidates.reduce((best, next) => (next[1] > best[1] ? next : best))
  return size >= TWO_FINGER_DEAD_ZONE_PX ? kind : 'none'
}

/**
 * Reads 1 or 2 pointers. One pointer steers (delta: pixels moved from its start). Two pointers are classified, unless `locked`
 * already names a two-finger kind, which then holds for the rest of the gesture; delta is that kind's value change since the
 * gesture started. Anything else is 'none'.
 */
export const readGesture = (pointers: readonly PointerTrack[], locked: GestureKind = 'none', rotationByTwist = ROTATION_BY_TWIST): GestureReading => {
  if (pointers.length === 1) {
    const [p] = pointers as [PointerTrack]
    return { kind: 'steer', delta: distance(p.start, p.current) }
  }
  if (pointers.length !== 2) return { kind: 'none', delta: 0 }
  const [a, b] = pointers as [PointerTrack, PointerTrack]
  const motion = measureTwoFinger(a, b)
  const kind: TwoFingerKind = locked !== 'none' && locked !== 'steer' ? locked : classifyTwoFinger(motion, rotationByTwist)
  return { kind, delta: twoFingerDelta(kind, motion, rotationByTwist) }
}

/** Whether a one-finger press was a tap: short and nearly still. */
export const isTap = (durationMs: number, movedPx: number): boolean => durationMs <= TAP_MAX_MS && movedPx < TAP_SLOP_PX

/** Whether a tap at `at` (time and place) completes a double-tap with the previous tap, or null when there was none. */
export const isDoubleTap = (previous: { time: number; point: Point } | null, at: { time: number; point: Point }): boolean =>
  previous !== null && at.time - previous.time <= DOUBLE_TAP_MS && at.time >= previous.time && distance(previous.point, at.point) <= DOUBLE_TAP_SLOP_PX

/** `start + delta`, rounded to `step` and clamped to [min, max]. */
export const applyDelta = (start: number, delta: number, range: { min: number; max: number; step: number }): number => {
  const raw = start + delta
  const stepped = range.step > 0 ? Math.round(raw / range.step) * range.step : raw
  // Rounding to the step can leave float dust (0.1 + 0.2); trim it to the step's decimals.
  const decimals = Math.max(0, (String(range.step).split('.')[1] ?? '').length)
  const tidy = Number(stepped.toFixed(decimals))
  return Math.min(range.max, Math.max(range.min, tidy))
}
