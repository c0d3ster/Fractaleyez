export type VisualMeterOptions = {
  sampleRate: number
  /** Bins in the frequency bytes (an analyser node's `frequencyBinCount`). */
  binCount: number
  /** Bands to split the usable spectrum into. Default 8. */
  bandCount?: number
  /** How far back the energy average looks. Default 2000 ms. */
  averageMs?: number
  /** Where the top band ends, so it holds music instead of the empty air above a microphone's range. Default 16000 Hz. */
  maxHz?: number
}

/** What the visuals read each drawn frame. */
export type VisualReading = {
  /** Mean distance of the time-domain bytes from their midpoint (128), 0 for silence, up to 128. */
  energy: number
  /** The energy averaged over the last `averageMs`. */
  energyAverage: number
  /** Mean frequency byte (0 to 255) in each band, bass first. Bands widen toward the treble. */
  bands: Float64Array
}

const MIDPOINT = 128
const COMPACT_AT = 512

/**
 * What the visualizers need from an analyser node's byte data, once per drawn frame: the energy, its recent average and the band levels.
 * Allocation free after construction: `read` returns the same object each time, overwritten in place.
 */
export class VisualMeter {
  private readonly reading: VisualReading
  private readonly edges: Int32Array
  private readonly averageMs: number
  private values: number[] = []
  private spans: number[] = []
  private head = 0
  private sum = 0
  private total = 0

  constructor({ sampleRate, binCount, bandCount = 8, averageMs = 2000, maxHz = 16000 }: VisualMeterOptions) {
    const usable = Math.min(binCount, Math.round((maxHz / (sampleRate / 2)) * binCount))
    if (bandCount < 1 || usable < bandCount) throw new RangeError('VisualMeter needs at least one bin per band')
    this.averageMs = averageMs
    this.edges = new Int32Array(bandCount + 1)
    // Quadratic spacing: narrow bands in the bass, wide ones in the treble.
    for (let band = 1; band <= bandCount; band++) {
      const wanted = Math.round(usable * (band / bandCount) ** 2)
      this.edges[band] = band === bandCount ? usable : Math.min(Math.max(wanted, this.edges[band - 1]! + 1), usable - (bandCount - band))
    }
    this.reading = { energy: 0, energyAverage: 0, bands: new Float64Array(bandCount) }
  }

  read = (timeDomain: Uint8Array, frequency: Uint8Array, deltaMs: number): VisualReading => {
    const { reading, edges } = this
    let distance = 0
    for (let i = 0; i < timeDomain.length; i++) distance += Math.abs(timeDomain[i]! - MIDPOINT)
    reading.energy = timeDomain.length === 0 ? 0 : distance / timeDomain.length
    reading.energyAverage = this.average(reading.energy, deltaMs)
    for (let band = 0; band < reading.bands.length; band++) {
      const from = edges[band]!
      const to = edges[band + 1]!
      let sum = 0
      for (let bin = from; bin < to; bin++) sum += frequency[bin] ?? 0
      reading.bands[band] = sum / (to - from)
    }
    return reading
  }

  /** Time-weighted mean of the recent energies: the newest frame always counts, older ones until they fall out of the window. */
  private average = (value: number, deltaMs: number): number => {
    this.values.push(value)
    this.spans.push(deltaMs)
    this.sum += value * deltaMs
    this.total += deltaMs
    while (this.head < this.values.length - 1 && this.total - this.spans[this.head]! >= this.averageMs) {
      this.sum -= this.values[this.head]! * this.spans[this.head]!
      this.total -= this.spans[this.head]!
      this.head++
    }
    if (this.head >= COMPACT_AT) {
      this.values = this.values.slice(this.head)
      this.spans = this.spans.slice(this.head)
      this.head = 0
    }
    return this.total > 0 ? this.sum / this.total : value
  }
}
