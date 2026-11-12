export type BiquadKind = 'lowpass' | 'highpass'

export type BiquadCoefficients = { b0: number; b1: number; b2: number; a1: number; a2: number }

/**
 * The coefficients Web Audio's BiquadFilterNode uses for a lowpass or highpass (its spec formulas, Q given in dB), normalised by a0.
 * The frequency is capped just under Nyquist, as scripts/section-eval/levels.py does.
 */
export const webAudioBiquad = (kind: BiquadKind, frequencyHz: number, sampleRate: number, qDb = 1): BiquadCoefficients => {
  const w0 = (2 * Math.PI * Math.min(frequencyHz, (sampleRate / 2) * 0.999)) / sampleRate
  const alpha = Math.sin(w0) / (2 * 10 ** (qDb / 20))
  const cos = Math.cos(w0)
  const a0 = 1 + alpha
  const edge = kind === 'lowpass' ? (1 - cos) / 2 : (1 + cos) / 2
  return {
    b0: edge / a0,
    b1: (kind === 'lowpass' ? 1 - cos : -(1 + cos)) / a0,
    b2: edge / a0,
    a1: (-2 * cos) / a0,
    a2: (1 - alpha) / a0,
  }
}

/** One biquad section, direct form I, in 64-bit floats. */
export class Biquad {
  private x1 = 0
  private x2 = 0
  private y1 = 0
  private y2 = 0

  constructor(private readonly c: BiquadCoefficients) {}

  process = (x: number): number => {
    const { b0, b1, b2, a1, a2 } = this.c
    const y = b0 * x + b1 * this.x1 + b2 * this.x2 - a1 * this.y1 - a2 * this.y2
    this.x2 = this.x1
    this.x1 = x
    this.y2 = this.y1
    this.y1 = y
    return y
  }
}
