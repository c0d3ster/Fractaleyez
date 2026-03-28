import { userConfig as UserConfig } from '../config/user.config'

import { AudioSource } from './audio-source'
import { AudioData } from './audio-data'

export class AudioStream {
  private audioSource: AudioSource
  private audioContext: AudioContext
  private volume: number
  private sourceNode: AudioNode | null
  private gainNode: GainNode
  private analyserNode: AnalyserNode
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
    this.bufferLength = this.analyserNode.frequencyBinCount
  }

  init(): void {
    this.sourceNode = this.audioSource.getSourceNode()
    if (!this.sourceNode) {
      if (UserConfig.showerrors) console.error('Couldn\'t init the audio stream class. The audio source is empty.')
    } else {
      this.sourceNode.connect(this.gainNode)
      this.gainNode.connect(this.analyserNode)
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
