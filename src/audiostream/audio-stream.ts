import { userConfig as UserConfig } from '../config/user.config'

import { AudioSource } from './audio-source'
import { AudioData } from './audio-data'
import { MAX_BAND_WINDOW_SAMPLES, ONSET_BANDS } from '../audioanalysis/onset-bands'

const ANALYSER_SMOOTHING = 0.2

// Onset bands (see onset-bands.ts): the signal is split by band-pass filters so beat detection can hear the kick, snare,
// hats and so on on their own, then each band is read as a time-domain window (not FFT bins, which are ~94Hz wide at the
// main analyser's size). A 1024-sample window is ~21ms, longer than a 60fps frame, so consecutive frames cover all of
// the audio.
type OnsetBand = { filters: BiquadFilterNode[]; analyser: AnalyserNode }

export class AudioStream {
  private audioSource: AudioSource
  private audioContext: AudioContext
  private volume: number
  private sourceNode: AudioNode | null
  private gainNode: GainNode
  private analyserNode: AnalyserNode
  private onsetBands: OnsetBand[]
  private bandBuffer: Float32Array<ArrayBuffer>
  private bufferLength: number

  constructor(audiosource: AudioSource, fftsize: number) {
    this.audioSource = audiosource
    this.audioContext = audiosource.getAudioContext()
    this.volume = UserConfig.volume
    this.sourceNode = null

    this.gainNode = this.audioContext.createGain()
    this.gainNode.gain.setValueAtTime(this.volume, this.audioContext.currentTime)

    this.analyserNode = this.audioContext.createAnalyser()
    this.analyserNode.fftSize = fftsize
    // The default (0.8) averages frequency data over many frames, which delays and softens band attacks.
    this.analyserNode.smoothingTimeConstant = ANALYSER_SMOOTHING
    this.bufferLength = this.analyserNode.frequencyBinCount

    this.onsetBands = ONSET_BANDS.map(({ lowHz, highHz, windowSamples }) => {
      // Two cascaded filters per edge give a steeper (24 dB/octave) cut.
      const filters = [
        this.createFilter('highpass', lowHz),
        this.createFilter('highpass', lowHz),
        this.createFilter('lowpass', highHz),
        this.createFilter('lowpass', highHz),
      ]
      const analyser = this.audioContext.createAnalyser()
      analyser.fftSize = windowSamples
      return { filters, analyser }
    })
    this.bandBuffer = new Float32Array(MAX_BAND_WINDOW_SAMPLES)
  }

  init(): void {
    this.sourceNode = this.audioSource.getSourceNode()
    if (!this.sourceNode) {
      if (UserConfig.showerrors) console.error('Couldn\'t init the audio stream class. The audio source is empty.')
    } else {
      this.sourceNode.connect(this.gainNode)
      this.gainNode.connect(this.analyserNode)
      this.onsetBands.forEach(({ filters, analyser }) => {
        const chain: AudioNode[] = [this.gainNode, ...filters, analyser]
        chain.forEach((node, i) => {
          const next = chain[i + 1]
          if (next) node.connect(next)
        })
      })
      if (this.audioSource.isThereFeedback())
        this.analyserNode.connect(this.audioContext.destination)
      if (UserConfig.showloginfos) console.info('AudioStream class initialized\n------------')
    }
  }

  getAudioData(): AudioData {
    const tdData = new Uint8Array(this.bufferLength)
    const fData = new Uint8Array(this.bufferLength)
    this.analyserNode.getByteTimeDomainData(tdData)
    this.analyserNode.getByteFrequencyData(fData)
    return new AudioData(tdData, fData, this.bufferLength)
  }

  /** RMS level of each onset band (see ONSET_BANDS), in percent of full scale. */
  getBandLevels(): number[] {
    return this.onsetBands.map(({ analyser }) => {
      analyser.getFloatTimeDomainData(this.bandBuffer)
      // The shared buffer is sized for the longest window; only the first fftSize samples are this band's.
      const windowSamples = analyser.fftSize
      let sumOfSquares = 0
      for (let i = 0; i < windowSamples; i++) {
        const sample = this.bandBuffer[i] ?? 0
        sumOfSquares += sample * sample
      }
      return Math.sqrt(sumOfSquares / windowSamples) * 100
    })
  }

  private createFilter(type: BiquadFilterType, frequency: number): BiquadFilterNode {
    const filter = this.audioContext.createBiquadFilter()
    filter.type = type
    filter.frequency.value = frequency
    return filter
  }

  setVolume(volume: number): void {
    this.volume = volume
    this.gainNode.gain.setValueAtTime(volume, this.audioContext.currentTime)
  }

  getVolume(): number {
    return this.volume
  }

  getBufferSize(): number {
    return this.bufferLength
  }
}
