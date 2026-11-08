import { ColorState } from './colorState'

/** What the renderers read of the Color config. The same object is updated in place, so read it each frame rather than keeping fields. */
export type DisplayedColor = Pick<ColorState, 'key' | 'saturation' | 'phase' | 'cycles' | 'lut'>

// Reaching 95% of the way takes the crossfade time: exp(-3) is 5%.
const TIME_CONSTANTS_PER_CROSSFADE = 3
// Close enough to stop: under half a level of a byte on every palette entry, and a thousandth on the numbers.
const LUT_SETTLED = 0.5
const NUMBER_SETTLED = 0.001

/**
 * The Color config as it is shown, which follows the live config instead of jumping to it: a palette, saturation, phase or cycles change
 * eases over the user's crossfade time, the way a layer fades. It chases the latest target every frame (an exponential approach), so a slider
 * dragged continuously keeps moving the picture, a little behind the hand, where a fade restarted on each change would never get going.
 * The first target applies at once, so nothing fades in on load, and a crossfade of 0 is a plain cut.
 *
 * `key` changes on every frame the colors move and settles back to the target's own key, so a renderer that rebuilds on a key change
 * rebuilds only while the colors are moving.
 */
export class ColorFollower {
  private readonly shown: DisplayedColor = { key: '', saturation: 0, phase: 0, cycles: 1, lut: new Uint8Array(0) }
  private exactLut = new Float32Array(0)
  private started = false
  private frame = 0

  /** Moves toward `target` for `dtMs` of a `crossfadeMs` fade and returns the colors to draw this frame. */
  step = (target: ColorState, dtMs: number, crossfadeMs: number): DisplayedColor => {
    if (!this.started || crossfadeMs <= 0 || this.exactLut.length !== target.lut.length) return this.snap(target)
    const share = 1 - Math.exp(-TIME_CONSTANTS_PER_CROSSFADE * Math.max(0, dtMs) / crossfadeMs)
    const { shown, exactLut } = this
    let farthest = 0
    for (let i = 0; i < exactLut.length; i++) {
      const next = exactLut[i]! + (target.lut[i]! - exactLut[i]!) * share
      exactLut[i] = next
      farthest = Math.max(farthest, Math.abs(target.lut[i]! - next))
    }
    const saturation = shown.saturation + (target.saturation - shown.saturation) * share
    const phase = shown.phase + (target.phase - shown.phase) * share
    const cycles = shown.cycles + (target.cycles - shown.cycles) * share
    const settled = farthest < LUT_SETTLED
      && Math.abs(target.saturation - saturation) < NUMBER_SETTLED
      && Math.abs(target.phase - phase) < NUMBER_SETTLED
      && Math.abs(target.cycles - cycles) < NUMBER_SETTLED
    if (settled) return this.snap(target)
    for (let i = 0; i < exactLut.length; i++) shown.lut[i] = Math.round(exactLut[i]!)
    shown.saturation = saturation
    shown.phase = phase
    shown.cycles = cycles
    shown.key = `${target.key}~${++this.frame}`
    return shown
  }

  /** The colors as they are now, without moving them. */
  current = (): DisplayedColor => this.shown

  private snap = (target: ColorState): DisplayedColor => {
    const { shown } = this
    if (shown.lut.length !== target.lut.length) shown.lut = new Uint8Array(target.lut.length)
    shown.lut.set(target.lut)
    this.exactLut = Float32Array.from(target.lut)
    shown.saturation = target.saturation
    shown.phase = target.phase
    shown.cycles = target.cycles
    shown.key = target.key
    this.started = true
    return shown
  }
}
