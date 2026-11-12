import type { BeatState } from 'beatsense'

/** What every visualizer and layer reads for a drawn frame. One object, overwritten each frame: read it, don't keep it. */
export type AudioSnapshot = {
  /** Mean distance of the waveform from silence (0 to 128). */
  energy: number
  /** The energy averaged over the last two seconds. */
  energyAverage: number
  /** Mean frequency byte (0 to 255) in each band, bass first. */
  bands: ArrayLike<number>
  /** The shared beat definition. */
  beat: BeatState
}
