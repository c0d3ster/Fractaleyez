/**
 * The spiral for the logo's endless zoom (a twisted Droste). While Zoom is on, Spin no longer turns the chain of copies as one rigid
 * piece: each copy sits turned `twist` radians further than the copy around it, about the zoom's focus point. As the zoom goes one
 * level deeper every copy's level grows by one, so every copy turns by `twist`, and the loop's wrap (each copy taking the place of the
 * next bigger one) still lands on an identical picture.
 *
 * The Spin slider keeps its meaning: the picture turns at the Spin rate. The twist takes the part of that turn that comes from
 * zooming (twist times levels per second), and the rest is a plain rigid turn of the whole chain, so a stopped zoom (Speed 0) still
 * spins. A bigger Spin also means a tighter spiral, up to `MAX_TWIST`.
 */

/** Twist per level (radians) for each unit of Spin speed. Spin 1 turns each copy 45 degrees past the one around it. */
export const TWIST_PER_SPIN = Math.PI / 4
/** The most a copy turns past the one around it. Past half a turn the nesting stops reading as a spiral. */
export const MAX_TWIST = Math.PI
/** Half-life of the twist following its target, so a Spin drag winds the spiral up smoothly instead of snapping the small copies. */
export const TWIST_HALF_LIFE_SECONDS = 0.15

const clamp = (value: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, value))

/** The twist per level the Spin speed asks for (radians; the sign is the spin's direction). */
export const twistForSpin = (spinSpeed: number): number => clamp(spinSpeed * TWIST_PER_SPIN, -MAX_TWIST, MAX_TWIST)

/** Steps the twist toward its target over `dtSeconds`. */
export const followTwist = (twist: number, target: number, dtSeconds: number): number =>
  target + (twist - target) * Math.pow(0.5, Math.max(0, dtSeconds) / TWIST_HALF_LIFE_SECONDS)

/**
 * How far the rigid turn of the chain moves this frame: the whole spin, less what zooming `levelStep` levels deeper already turns
 * every copy by. Radians, positive clockwise like `bearing`.
 */
export const rigidTurn = (spin: number, twist: number, levelStep: number): number => spin - twist * levelStep

/**
 * A zoom copy's transform in the logo group's unit space (x and y in [-0.5, 0.5], y up), column-major like `THREE.Matrix4.elements`.
 * The logo group scales x by the image's `aspect`, so the turn is built in the image's own proportions (scaled to aspect, turned,
 * scaled back) and a turned copy is not sheared. The copy is `scale` times the logo's size, turned `angle` radians clockwise about
 * the focus point `(px, py)` (an offset from the middle, in unit space), which stays put.
 */
export const copyMatrix = (scale: number, angle: number, aspect: number, px: number, py: number): number[] => {
  // Clockwise on screen is a negative angle in the plane's y-up space.
  const cos = Math.cos(-angle)
  const sin = Math.sin(-angle)
  // Linear part: scale * D^-1 R D with D = diag(aspect, 1).
  const a = scale * cos
  const b = scale * -sin / aspect
  const c = scale * sin * aspect
  const d = scale * cos
  // The focus maps onto itself: t = p - L p.
  const tx = px - (a * px + b * py)
  const ty = py - (c * px + d * py)
  return [
    a, c, 0, 0,
    b, d, 0, 0,
    0, 0, 1, 0,
    tx, ty, 0, 1,
  ]
}
