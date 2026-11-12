// What a recorded tick carries beyond the section tracker's own input (the mean band power, the beats and the BPM shown): the peak of
// each band, which band's own onsets fired, and a coarse spectrum. None of these can be worked out later from the mean band power, so a
// listening session recorded for training keeps them from the start (src/spotify/listen-recorder.ts).
import { ONSET_BANDS } from '../onset/onset-bands'

const BANDS = ONSET_BANDS.length

/** How many spectrum bands a tick keeps, log-spaced from SPECTRUM_LOW_HZ to SPECTRUM_HIGH_HZ. */
export const SPECTRUM_BANDS = 40
export const SPECTRUM_LOW_HZ = 40
export const SPECTRUM_HIGH_HZ = 16000

/** The edges of the spectrum bands in Hz (SPECTRUM_BANDS + 1 of them). */
export const spectrumEdgesHz = (): number[] => {
  const ratio = SPECTRUM_HIGH_HZ / SPECTRUM_LOW_HZ
  return Array.from({ length: SPECTRUM_BANDS + 1 }, (_, i) => Math.round(SPECTRUM_LOW_HZ * ratio ** (i / SPECTRUM_BANDS) * 10) / 10)
}

/** One tick's extras. `onsets` is a bit per onset band (bit 0 bass ... bit 4 air): the band's own onset fired in the tick. */
export type TickExtras = {
  peak: number[]
  onsets: number
  /** SPECTRUM_BANDS values, 0 to 255, or null when no spectrum came with the frames. */
  spectrum: number[] | null
}

export type ExtrasFrame = {
  levels: readonly number[]
  /** Each band's own onset on this frame (BandReading.rising), whether or not the band may set off a beat. */
  onsets?: readonly boolean[]
  /** This frame's pooled spectrum (SpectrumReducer). */
  spectrum?: ArrayLike<number> | null
}

/** Pools frames into one tick's extras: the peak of each band's power, the onsets that fired, the mean spectrum. */
export class TickExtrasAccumulator {
  private readonly peak = new Float64Array(BANDS)
  private readonly spectrum = new Float64Array(SPECTRUM_BANDS)
  private spectrumFrames = 0
  // 1 for each band whose own onset fired in the tick.
  private readonly onsets = new Uint8Array(BANDS)

  add = ({ levels, onsets, spectrum }: ExtrasFrame): void => {
    for (let b = 0; b < BANDS; b++) {
      const power = (levels[b] ?? 0) ** 2
      if (power > this.peak[b]!) this.peak[b] = power
      if (onsets?.[b]) this.onsets[b] = 1
    }
    if (!spectrum) return
    for (let b = 0; b < SPECTRUM_BANDS; b++) this.spectrum[b]! += spectrum[b] ?? 0
    this.spectrumFrames++
  }

  /** The tick's extras, and a fresh start for the next tick. */
  flush = (): TickExtras => {
    const frames = this.spectrumFrames
    const extras: TickExtras = {
      peak: Array.from(this.peak),
      onsets: this.onsets.reduce((bits, fired, b) => bits + fired * 2 ** b, 0),
      spectrum: frames > 0 ? Array.from(this.spectrum, (sum) => Math.round(sum / frames)) : null,
    }
    this.reset()
    return extras
  }

  reset = (): void => {
    this.peak.fill(0)
    this.spectrum.fill(0)
    this.spectrumFrames = 0
    this.onsets.fill(0)
  }
}
