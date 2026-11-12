import { fft } from './fft'

const MIN_DB = -100
const MAX_DB = -30
const BLACKMAN_ALPHA = 0.16

/**
 * What an AnalyserNode reads from the newest `fftSize` samples: byte time-domain data (for the energy) and byte frequency data (Blackman
 * window, magnitude over fftSize, smoothed across reads, scaled from -100 to -30 dB onto 0..255).
 */
export class SpectrumAnalyser {
  readonly binCount: number
  private readonly ring: Float64Array
  private head = 0
  private readonly window: Float64Array
  private readonly re: Float64Array
  private readonly im: Float64Array
  private readonly smoothed: Float64Array
  private readonly bytes: Uint8Array

  constructor(readonly fftSize = 512, private readonly smoothing = 0.2) {
    this.binCount = fftSize / 2
    this.ring = new Float64Array(fftSize)
    this.window = Float64Array.from({ length: fftSize }, (_, i) => {
      const phase = i / fftSize
      return (1 - BLACKMAN_ALPHA) / 2 - 0.5 * Math.cos(2 * Math.PI * phase) + (BLACKMAN_ALPHA / 2) * Math.cos(4 * Math.PI * phase)
    })
    this.re = new Float64Array(fftSize)
    this.im = new Float64Array(fftSize)
    this.smoothed = new Float64Array(this.binCount)
    this.bytes = new Uint8Array(this.binCount)
  }

  push = (samples: ArrayLike<number>): void => {
    for (let i = 0; i < samples.length; i++) {
      this.ring[this.head] = samples[i]!
      this.head = (this.head + 1) % this.fftSize
    }
  }

  /** The i-th newest-window sample, oldest first. */
  private at = (i: number): number => this.ring[(this.head + i) % this.fftSize]!

  /** Mean distance of the byte time-domain data from its midpoint (128): what AudioAnalyser calls the energy. 0 for silence. */
  energy = (): number => {
    let sum = 0
    for (let i = 0; i < this.fftSize; i++) {
      const byte = Math.min(255, Math.max(0, Math.floor(128 * (1 + this.at(i)))))
      sum += Math.abs(byte - 128)
    }
    return sum / this.fftSize
  }

  /** The byte frequency data. Not a copy: read it before the next call. Call once per frame, the smoothing runs across calls. */
  read = (): Uint8Array => {
    for (let i = 0; i < this.fftSize; i++) {
      this.re[i] = this.at(i) * this.window[i]!
      this.im[i] = 0
    }
    fft(this.re, this.im)
    for (let k = 0; k < this.binCount; k++) {
      const magnitude = Math.hypot(this.re[k]!, this.im[k]!) / this.fftSize
      this.smoothed[k] = this.smoothing * this.smoothed[k]! + (1 - this.smoothing) * magnitude
      const db = 20 * Math.log10(Math.max(this.smoothed[k]!, 1e-12))
      this.bytes[k] = Math.min(255, Math.max(0, Math.floor((255 * (db - MIN_DB)) / (MAX_DB - MIN_DB))))
    }
    return this.bytes
  }
}
