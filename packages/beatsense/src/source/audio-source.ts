import { PROCESSOR_NAME, unpackFrame } from '../worklet/frame-message'
import type { CaptureCommand, CaptureFrame } from '../worklet/frame-message'

export type AudioSourceOptions = {
  /** The audio context to measure in. Created by the caller, so this module touches no global when imported or constructed. */
  context: AudioContext
  /** Where the bundled worklet processor (the package's `./worklet` entry) is served from. */
  workletUrl: string
  /** Defaults to `navigator.mediaDevices.getUserMedia`. */
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>
}

/**
 * The microphone's voice processing (auto gain, noise suppression, echo cancellation) pumps the level and flattens transients, which
 * makes beat detection erratic on music, so all three are off.
 */
export const MIC_CONSTRAINTS: MediaTrackConstraints = { autoGainControl: false, noiseSuppression: false, echoCancellation: false }

export type FrameListener = (frame: CaptureFrame) => void

/**
 * Captures audio into the measuring worklet. `start` loads the processor and builds its node; `connectMicrophone` opens the microphone
 * (or hand any node to `input`). Measured frames come out of `onFrame`, from the worklet's message port, so they keep arriving with
 * the tab hidden. `input` is the node to connect the audio into; it is already routed (muted) to the destination so the browser keeps
 * it running.
 */
export class AudioSource {
  private node: AudioWorkletNode | null = null
  private readonly listeners = new Set<FrameListener>()
  private spectrum = true

  constructor(private readonly options: AudioSourceOptions) {}

  get context(): AudioContext {
    return this.options.context
  }

  /** The node to connect audio to. Throws before `start`. */
  get input(): AudioNode {
    if (!this.node) throw new Error('AudioSource is not started')
    return this.node
  }

  start = async (): Promise<void> => {
    if (this.node) return
    const { context, workletUrl } = this.options
    await context.audioWorklet.addModule(workletUrl)
    const node = new AudioWorkletNode(context, PROCESSOR_NAME, { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] })
    node.port.onmessage = ({ data }: MessageEvent<Float64Array>): void => {
      const frame = unpackFrame(data)
      this.listeners.forEach((listener) => listener(frame))
    }
    // An unconnected worklet node may not be run; a gain of 0 keeps it in the graph without making a sound.
    const mute = context.createGain()
    mute.gain.value = 0
    node.connect(mute)
    mute.connect(context.destination)
    this.node = node
    this.sendSpectrum()
  }

  /** Open the microphone and return its source node, for the caller to route (through a volume, an analyser) into `input`. */
  connectMicrophone = async (): Promise<MediaStreamAudioSourceNode> => {
    const getUserMedia = this.options.getUserMedia ?? ((constraints: MediaStreamConstraints): Promise<MediaStream> => navigator.mediaDevices.getUserMedia(constraints))
    const stream = await getUserMedia({ audio: MIC_CONSTRAINTS })
    return this.options.context.createMediaStreamSource(stream)
  }

  onFrame = (listener: FrameListener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Whether frames carry the pooled spectrum (an FFT a frame): only while the riser and sweep are read. */
  setSpectrum = (on: boolean): void => {
    if (on === this.spectrum) return
    this.spectrum = on
    this.sendSpectrum()
  }

  stop = (): void => {
    this.node?.disconnect()
    if (this.node) this.node.port.onmessage = null
    this.node = null
    this.listeners.clear()
  }

  private sendSpectrum = (): void => {
    const command: CaptureCommand = { type: 'spectrum', on: this.spectrum }
    this.node?.port.postMessage(command)
  }
}
