import type { OnsetBandSpec } from '../onset/onset-bands'
import { Biquad, webAudioBiquad } from './biquad'

export class BandChannel {
  private readonly filters: Biquad[]
  private readonly squares: Float64Array
  private head = 0
  private seen = 0

  constructor(spec: OnsetBandSpec, sampleRate: number) {
    const { lowHz, highHz, windowSamples } = spec
    // Two cascaded filters per edge, as AudioStream builds them (24 dB/octave).
    this.filters = [
      new Biquad(webAudioBiquad('highpass', lowHz, sampleRate)),
      new Biquad(webAudioBiquad('highpass', lowHz, sampleRate)),
      new Biquad(webAudioBiquad('lowpass', highHz, sampleRate)),
      new Biquad(webAudioBiquad('lowpass', highHz, sampleRate)),
    ]
    this.squares = new Float64Array(windowSamples)
  }

  push = (x: number): void => {
    let y = x
    for (const filter of this.filters) y = filter.process(y)
    this.squares[this.head] = y * y
    this.head = (this.head + 1) % this.squares.length
    this.seen++
  }

  /** RMS of the newest window of filtered samples, in percent of full scale. Before a full window has played it averages what there is. */
  read = (): number => {
    const count = Math.min(this.seen, this.squares.length)
    let sum = 0
    for (let i = 0; i < count; i++) sum += this.squares[i]!
    return Math.sqrt(sum / Math.max(1, count)) * 100
  }
}
