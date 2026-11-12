import { ONSET_BANDS } from '../onset/onset-bands'
import type { OnsetBandSpec } from '../onset/onset-bands'
import { BandChannel } from './band-channel'

/** The five onset band levels from PCM: each band two highpass and two lowpass stages, read as the RMS of its own window (levels.py's maths). */
export class BandLevels {
  private readonly channels: BandChannel[]

  constructor(sampleRate: number, bands: readonly OnsetBandSpec[] = ONSET_BANDS) {
    this.channels = bands.map((spec) => new BandChannel(spec, sampleRate))
  }

  push = (samples: ArrayLike<number>): void => {
    for (let i = 0; i < samples.length; i++) {
      const x = samples[i]!
      for (const channel of this.channels) channel.push(x)
    }
  }

  read = (): number[] => this.channels.map((channel) => channel.read())
}
