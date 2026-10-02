import { userConfig as UserConfig } from '../config/user.config'

import { AudioSource } from './audio-source'
import { AudioData } from './audio-data'

const ANALYSER_SMOOTHING = 0.2

// Onset bands: the signal is split by filters so beat detection can hear the kick and the snare/clap on their own,
// then each band is read as a time-domain window (not FFT bins, which are ~94Hz wide at the main analyser's size).
// 1024 samples is ~21ms, longer than a 60fps frame, so consecutive frames cover all of the audio. Hats sit above the
// mid band on purpose so they don't fire on every 8th note.
type OnsetBandSpec = { highpassHz?: number; lowpassHz: number }
export const ONSET_BANDS: OnsetBandSpec[] = [
  { lowpassHz: 150 },
  { highpassHz: 200, lowpassHz: 6000 },
]
const BAND_WINDOW_SAMPLES = 1024

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

    this.onsetBands = ONSET_BANDS.map(({ highpassHz, lowpassHz }) => {
      // Two cascaded filters per edge give a steeper (24 dB/octave) cut.
      const filters = [
        ...(highpassHz ? [this.createFilter('highpass', highpassHz), this.createFilter('highpass', highpassHz)] : []),
        this.createFilter('lowpass', lowpassHz),
        this.createFilter('lowpass', lowpassHz),
      ]
      const analyser = this.audioContext.createAnalyser()
      analyser.fftSize = BAND_WINDOW_SAMPLES
      return { filters, analyser }
    })
    this.bandBuffer = new Float32Array(BAND_WINDOW_SAMPLES)
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
      let sumOfSquares = 0
      for (let i = 0; i < this.bandBuffer.length; i++) {
        const sample = this.bandBuffer[i] ?? 0
        sumOfSquares += sample * sample
      }
      return Math.sqrt(sumOfSquares / this.bandBuffer.length) * 100
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
