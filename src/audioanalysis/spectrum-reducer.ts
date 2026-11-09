import { SPECTRUM_BANDS, spectrumEdgesHz } from './tick-extras'

/**
 * Pools the analyser's byte frequency data (getByteFrequencyData: 0 to 255 over its decibel range) into SPECTRUM_BANDS bands, each the
 * mean of the bins whose centre falls in it. A band too narrow to hold a bin (the lowest ones, with 512-point FFT bins about 94 Hz wide)
 * takes the bin nearest its centre, so it repeats its neighbour rather than reading zero.
 */
export class SpectrumReducer {
  private readonly from: Int32Array
  private readonly to: Int32Array
  private readonly out = new Uint8Array(SPECTRUM_BANDS)

  constructor(sampleRate: number, binCount: number) {
    const binHz = sampleRate / 2 / binCount
    const edges = spectrumEdgesHz()
    this.from = new Int32Array(SPECTRUM_BANDS)
    this.to = new Int32Array(SPECTRUM_BANDS)
    for (let b = 0; b < SPECTRUM_BANDS; b++) {
      const lo = Math.ceil(edges[b]! / binHz)
      const hi = Math.min(binCount, Math.ceil(edges[b + 1]! / binHz))
      if (hi > lo) {
        this.from[b] = lo
        this.to[b] = hi
      } else {
        const nearest = Math.min(binCount - 1, Math.round(Math.sqrt(edges[b]! * edges[b + 1]!) / binHz))
        this.from[b] = nearest
        this.to[b] = nearest + 1
      }
    }
  }

  /** The pooled bands. Not a copy: read it before the next call. */
  reduce = (bins: ArrayLike<number>): Uint8Array => {
    for (let b = 0; b < SPECTRUM_BANDS; b++) {
      let sum = 0
      const from = this.from[b]!
      const to = this.to[b]!
      for (let i = from; i < to; i++) sum += bins[i] ?? 0
      this.out[b] = Math.round(sum / (to - from))
    }
    return this.out
  }
}
