import type { Complex } from './complex'
import type { FixedPointResult } from './koenigs'

export type FamousShape = {
  name: string
  re: number
  im: number
  /** The index in the family's tour of the stop at this shape: picking the chip moves the Tour slider there, so it stays on the Tour. */
  tourStop: number
}

/** The part of the parameter plane the shape pad shows and accepts. */
export type MapView = { reMin: number; reMax: number; imMin: number; imMax: number }

/** One step of the map in place, on plain numbers (the CPU paths run it thousands of times a frame, so no objects). */
export type StepInPlace = (z: [number, number], cRe: number, cIm: number) => void

/** The GLSL that makes the fractal shader draw this family. Each is the body of a function; see shaders/julia-fragment.glsl.ts. */
export type FamilyGlsl = {
  /** Body of `vec2 familyStep(vec2 z, vec2 c)`: one step of the map. `complexMul` and `complexSquare` are in scope. */
  step: string
  /** Body of `bool familyEscaped(vec2 z)`: true once z has escaped. */
  escaped: string
  /** Body of `float familySmooth(vec2 z, float n)`: the smooth escape count for a z that escaped on step n (0-based). */
  smooth: string
}

/**
 * A family of Julia sets the fractal layer can draw: a map f(z) with one complex parameter c (the "shape"), which the Tour slider and
 * the shape pad move. Everything the endless zoom needs about the family lives here, so the visualizer and the pad stay generic.
 */
export type FractalFamily = {
  /** Stored in presets as the family's index in FRACTAL_FAMILIES; the key is for code and tests. */
  key: string
  /** Name on the Type picker. */
  label: string
  /** Shown in the info strip, in plain words. */
  description: string
  /** The family's proper name, shown in the info strip after the friendly label for anyone who knows the math. */
  mathName: string
  /** The map, as text (z² + c), shown with the math name. */
  formula: string
  /** The Tour slider's path through the parameter plane, as [re, im] stops (interpolated with a spline). */
  tour: readonly (readonly [number, number])[]
  famousShapes: readonly FamousShape[]
  mapView: MapView
  /** Plane radius that fits the whole set at Scale 0.2x. */
  wholeSetRadius: number
  /**
   * How big the parameter plane's features are next to the classic family's (1, a map about 3 units wide). The audio wobble and drift on
   * c, the Switcheroo hops and the manual glide all scale by it, so they move the shape about as much in every family.
   */
  parameterScale: number
  /** Where the widest views center, in the plane. */
  wholeSetCenter: Complex
  /**
   * The widest view radius whose loop still wraps without a visible pop (the third-order zoom coordinate's error grows with the cube of
   * the radius); wider views breathe instead of looping. 0.2 was measured for z^2 + c.
   */
  seamSafeRadius: number
  /**
   * When set, the loop runs faster or slower so a zoom by this multiplier per period keeps the classic family's pace: the zoom's speed is
   * ln|lambda| per period, and the families' multipliers range much wider than z^2 + c's. Unset keeps the loop speed as it is.
   */
  referenceMultiplier?: number
  /** Where the zoom dives and how it loops, for parameter c. `previous` is the last frame's fixed point, to stay on the same one. */
  fixedPoint: (c: Complex, previous: Complex | null) => FixedPointResult
  step: StepInPlace
  escaped: (zRe: number, zIm: number) => boolean
  /** True when c is on the "connected, detailed" side of the parameter plane (Switcheroo hops stay on the same side). */
  parameterInSet: (c: Complex) => boolean
  /** The shape pad's picture: a smooth escape count of the critical orbit for parameter c, or -1 when it never escapes. */
  mapIterations: (c: Complex, maxIterations: number) => number
  glsl: FamilyGlsl
}
