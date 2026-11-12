// The AudioWorklet that measures: it runs in the audio rendering thread, so it does only the cheap part (the front end) and posts a
// packed frame (see frame-message.ts) 60 times a second. Bundled on its own (the `./worklet` entry); never imported by the root entry.
import { FrameEmitter } from './frame-emitter'
import { PROCESSOR_NAME, packFrame } from './frame-message'
import type { CaptureCommand } from './frame-message'

class CaptureProcessor extends AudioWorkletProcessor {
  private readonly emitter = new FrameEmitter(sampleRate)
  private readonly mono = new Float32Array(128)

  constructor() {
    super()
    this.port.onmessage = ({ data }: MessageEvent<CaptureCommand>): void => {
      if (data.type === 'spectrum') this.emitter.setSpectrum(data.on)
    }
  }

  process = (inputs: Float32Array[][]): boolean => {
    const channels = inputs[0]
    const first = channels?.[0]
    if (!channels || !first) return true
    // Mix down to mono as an analyser does: the mean of the channels.
    const block = channels.length === 1 ? first : this.mix(channels, first.length)
    this.emitter.push(block).forEach((frame) => {
      const packed = packFrame(frame)
      this.port.postMessage(packed, [packed.buffer])
    })
    return true
  }

  private mix = (channels: Float32Array[], length: number): Float32Array => {
    const out = length === this.mono.length ? this.mono : new Float32Array(length)
    out.fill(0)
    channels.forEach((channel) => {
      for (let i = 0; i < length; i++) out[i] = (out[i] ?? 0) + (channel[i] ?? 0) / channels.length
    })
    return out
  }
}

registerProcessor(PROCESSOR_NAME, CaptureProcessor)
