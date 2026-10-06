/**
 * The Color config's hue window: a stretch of the color wheel (positions 0..1, red at 0) that Orbit and Fractal colors
 * are drawn from. `start` is where the window begins, `span` how much of the wheel it covers, so the full wheel is
 * span 1 and the window wraps across the red end naturally. The Julia shader repeats `cosineParam` in GLSL.
 */

/** At or above this span the window counts as the whole wheel (the default, unrestricted look). */
export const FULL_WHEEL_SPAN = 0.999

const fract = (value: number): number => value - Math.floor(value)

export const isFullWheel = (span: number): boolean => span >= FULL_WHEEL_SPAN

/** Maps a raw 0..1 hue into the window. A full-wheel window at start 0 leaves it untouched. */
export const windowHue = (raw: number, start: number, span: number): number => fract(start + raw * span)

/** 0..1..0 triangle wave, so a drifting position sweeps back and forth across a window instead of jumping at its edge. */
export const pingPong = (position: number): number => 1 - Math.abs(2 * fract(position) - 1)

/**
 * The Julia palette's phase parameter (its cosine palette runs through the wheel opposite to HSL hue) for a running
 * palette position. The full wheel just turns by `start`; a narrower window sweeps back and forth across itself.
 */
export const cosineParam = (position: number, start: number, span: number): number =>
  isFullWheel(span) ? position - start : -(start + span * pingPong(position))
