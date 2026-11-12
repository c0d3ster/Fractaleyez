import { SpectrumReducer } from '../risers/spectrum-reducer'
import { BandLevels } from './band-levels'
import { SpectrumAnalyser } from './spectrum'

export type FrontEndOptions = {
  /** Also pool the 40-band spectrum for the sweep detector each read. Costs an FFT a frame. Default true. */
  spectrum?: boolean
  /** The FFT size the spectrum and energy are read at (the app runs 512). */
  fftSize?: number
  /** Analyser smoothing across reads (the app runs 0.2). */
  smoothing?: number
}

export type FrontEndReading = {
  /** The five onset band levels, RMS in percent of full scale. */
  levels: number[]
  /** Mean time-domain deviation (0 for silence). */
  energy: number
  /** The 40 pooled spectrum bands, when `spectrum` is on. Not a copy: read it before the next call. */
  spectrum?: Uint8Array
}

/** PCM in, one frame's reading out: pure TypeScript, so the same maths runs in the browser and in Node. Feed samples with `push`, then `read` once per frame. */
export class FrontEnd {
  private readonly bands: BandLevels
  private readonly analyser: SpectrumAnalyser
  private readonly reducer: SpectrumReducer | null

  constructor(sampleRate: number, { spectrum = true, fftSize = 512, smoothing = 0.2 }: FrontEndOptions = {}) {
    this.bands = new BandLevels(sampleRate)
    this.analyser = new SpectrumAnalyser(fftSize, smoothing)
    this.reducer = spectrum ? new SpectrumReducer(sampleRate, this.analyser.binCount) : null
  }

  push = (samples: ArrayLike<number>): void => {
    this.bands.push(samples)
    this.analyser.push(samples)
  }

  read = (): FrontEndReading => {
    const reading: FrontEndReading = { levels: this.bands.read(), energy: this.analyser.energy() }
    if (this.reducer) reading.spectrum = this.reducer.reduce(this.analyser.read())
    return reading
  }
}
