import { QualityProfile } from '../config/quality.config'
import { stepToward } from './step-toward'

/** The parts of a quality tier that show as a jump when they change at once, and so are moved toward the new tier's value instead. */
export type RampedValues = {
  fractalScale: number
  bloomScale: number
  /** 0 to 1: how much of the bicubic lookup is mixed into zoomed logo copies. */
  logoBicubic: number
}

const FRACTAL_SCALE_PER_SECOND = 1.5
const BLOOM_SCALE_PER_SECOND = 0.75
const LOGO_BICUBIC_PER_SECOND = 3
// Each new scale reallocates a render target, so a scale is applied in steps of this much rather than every frame. The target itself is always reached exactly.
const SCALE_STEP = 0.05

const quantize = (value: number, target: number): number => (value === target ? target : Math.round(value / SCALE_STEP) * SCALE_STEP)

const valuesOf = ({ fractalScale, bloomScale, logoBicubic }: QualityProfile): RampedValues => ({
  fractalScale,
  bloomScale,
  logoBicubic: logoBicubic ? 1 : 0,
})

/**
 * Moves the fractal's and the glow's resolution and the logo's bicubic mix toward a new tier over a few tenths of a second, so a tier change
 * is a quick transition and not one frame that is suddenly sharper or softer. The first tier applies at once. `step` returns only the values that
 * have a new value to apply, so the caller touches a render target only when its size really changes.
 */
export class ProfileRamp {
  private target: RampedValues | null = null
  private current: RampedValues | null = null
  private applied: RampedValues | null = null

  setTarget = (profile: QualityProfile): Partial<RampedValues> => {
    this.target = valuesOf(profile)
    if (this.current) return {}
    this.current = { ...this.target }
    this.applied = { ...this.target }
    return { ...this.target }
  }

  isSettled = (): boolean => !this.target || !this.current || (
    this.current.fractalScale === this.target.fractalScale
    && this.current.bloomScale === this.target.bloomScale
    && this.current.logoBicubic === this.target.logoBicubic
  )

  step = (dtMs: number): Partial<RampedValues> => {
    const { target, current, applied } = this
    if (!target || !current || !applied || this.isSettled()) return {}
    const seconds = Math.max(0, dtMs) / 1000
    current.fractalScale = stepToward(current.fractalScale, target.fractalScale, FRACTAL_SCALE_PER_SECOND * seconds)
    current.bloomScale = stepToward(current.bloomScale, target.bloomScale, BLOOM_SCALE_PER_SECOND * seconds)
    current.logoBicubic = stepToward(current.logoBicubic, target.logoBicubic, LOGO_BICUBIC_PER_SECOND * seconds)
    const next: Partial<RampedValues> = {}
    const fractalScale = quantize(current.fractalScale, target.fractalScale)
    const bloomScale = quantize(current.bloomScale, target.bloomScale)
    if (fractalScale !== applied.fractalScale) next.fractalScale = applied.fractalScale = fractalScale
    if (bloomScale !== applied.bloomScale) next.bloomScale = applied.bloomScale = bloomScale
    if (current.logoBicubic !== applied.logoBicubic) next.logoBicubic = applied.logoBicubic = current.logoBicubic
    return next
  }
}
