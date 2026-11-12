import { userConfig as UserConfig } from '../config/user.config'

// The test click for the lag soundcheck: a kick-like thump (a falling pitch from about 155 to 45 Hz that dies away), loud enough to be heard as a beat.
const CLICK_SECONDS = 0.25
const CLICK_LEVEL = 0.9
// The default (0.8) averages frequency data over many frames, which delays and softens band attacks.
const SMOOTHING = 0.2

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

/** The bytes the visuals read each drawn frame. */
export type ByteFrame = { timeDomain: Uint8Array<ArrayBuffer>; frequency: Uint8Array<ArrayBuffer> }

/** Where AudioFeed gets the bytes for the visuals: the tap, or a recording or synthetic source in a test. */
export type ByteSource = {
  sampleRate: number
  binCount: number
  /** Fill and return the bytes for now. The arrays may be reused by the next call. */
  read: () => ByteFrame
}

/**
 * The visuals' side of the audio: a volume into an analyser node whose time-domain and frequency bytes the layers read each drawn frame.
 * What the beat detectors hear is measured separately in the capture worklet (AudioSource in beatsense), fed from the same volume.
 */
export class VisualTap implements ByteSource {
  readonly sampleRate: number
  readonly binCount: number
  private readonly gain: GainNode
  private readonly analyser: AnalyserNode
  private readonly frame: ByteFrame
  private clickBuffer: AudioBuffer | null = null

  constructor(private readonly context: AudioContext, fftSize: number) {
    this.sampleRate = context.sampleRate
    this.gain = context.createGain()
    this.gain.gain.setValueAtTime(UserConfig.volume, context.currentTime)
    this.analyser = context.createAnalyser()
    this.analyser.fftSize = fftSize
    this.analyser.smoothingTimeConstant = SMOOTHING
    this.binCount = this.analyser.frequencyBinCount
    this.frame = { timeDomain: new Uint8Array(this.binCount), frequency: new Uint8Array(this.binCount) }
  }

  /** Route `source` (the microphone) through the volume into the analyser and into `capture`, the worklet that measures for the detectors. */
  connect = (source: AudioNode | null, capture: AudioNode): void => {
    if (!source) {
      if (UserConfig.showerrors) console.error('Couldn\'t connect the audio tap: there is no audio source.')
      return
    }
    source.connect(this.gain)
    this.gain.connect(this.analyser)
    this.gain.connect(capture)
  }

  /** Starts a silent test click at `contextTime` (audio-clock seconds), entering where the microphone's sound does (before the volume). */
  injectClick = (contextTime: number): void => {
    this.clickBuffer ??= buildClickBuffer(this.context)
    const click = this.context.createBufferSource()
    click.buffer = this.clickBuffer
    click.connect(this.gain)
    click.start(contextTime)
  }

  read = (): ByteFrame => {
    this.analyser.getByteTimeDomainData(this.frame.timeDomain)
    this.analyser.getByteFrequencyData(this.frame.frequency)
    return this.frame
  }
}
