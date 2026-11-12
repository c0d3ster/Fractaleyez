import { userConfig as UserConfig } from '../config/user.config'

import { AudioData } from './audio-data'

const ANALYSER_SMOOTHING = 0.2

// The test click for the lag soundcheck: a kick-like thump (a falling pitch from about 155 to 45 Hz that dies away), loud enough to be heard as a beat.
const CLICK_SECONDS = 0.25
const CLICK_LEVEL = 0.9

const buildClickBuffer = (context: BaseAudioContext): AudioBuffer => {
  const { sampleRate } = context
  const buffer = context.createBuffer(1, Math.round(CLICK_SECONDS * sampleRate), sampleRate)
  const samples = buffer.getChannelData(0)
  let phase = 0
  for (let i = 0; i < samples.length; i++) {
    const seconds = i / sampleRate
    phase += (2 * Math.PI * (45 + 110 * Math.exp(-seconds * 28))) / sampleRate
    samples[i] = CLICK_LEVEL * Math.sin(phase) * Math.exp(-seconds * 11)
  }
  return buffer
}

/**
 * The visuals' side of the audio: a volume and an analyser node whose time-domain and frequency bytes the layers read each drawn frame.
 * What the beat detectors hear is measured separately, in the capture worklet (see AudioSource in beatsense), fed from the same volume.
 */
export class AudioStream {
  private audioContext: AudioContext
  private volume: number
  private gainNode: GainNode
  private analyserNode: AnalyserNode
  private bufferLength: number
  private clickBuffer: AudioBuffer | null = null

  constructor(audioContext: AudioContext, fftsize: number) {
    this.audioContext = audioContext
    this.volume = UserConfig.volume

    this.gainNode = this.audioContext.createGain()
    this.gainNode.gain.setValueAtTime(this.volume, this.audioContext.currentTime)

    this.analyserNode = this.audioContext.createAnalyser()
    this.analyserNode.fftSize = fftsize
    // The default (0.8) averages frequency data over many frames, which delays and softens band attacks.
    this.analyserNode.smoothingTimeConstant = ANALYSER_SMOOTHING
    this.bufferLength = this.analyserNode.frequencyBinCount
  }

  /** Route `sourceNode` (the microphone) through the volume into the analyser and into `capture`, the worklet that measures for the detectors. */
  init(sourceNode: AudioNode | null, capture: AudioNode): void {
    if (!sourceNode) {
      if (UserConfig.showerrors) console.error('Couldn\'t init the audio stream class. The audio source is empty.')
      return
    }
    sourceNode.connect(this.gainNode)
    this.gainNode.connect(this.analyserNode)
    this.gainNode.connect(capture)
    if (UserConfig.showloginfos) console.info('AudioStream class initialized\n------------')
  }

  /** Starts a silent test click at `contextTime` (audio-clock seconds), entering where the microphone's sound does (before the volume). */
  injectClick = (contextTime: number): void => {
    this.clickBuffer ??= buildClickBuffer(this.audioContext)
    const click = this.audioContext.createBufferSource()
    click.buffer = this.clickBuffer
    click.connect(this.gainNode)
    click.start(contextTime)
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
