import { FrontEnd } from '../frontend'
import { CAPTURE_HZ } from './frame-message'
import type { CaptureFrame } from './frame-message'

const view = (block: ArrayLike<number>, from: number, to: number): ArrayLike<number> =>
  block instanceof Float32Array || block instanceof Float64Array ? block.subarray(from, to) : Array.from(block).slice(from, to)

/**
 * Runs the front end over the audio as it arrives (any block size, the worklet's 128-sample quanta in practice) and cuts it into frames
 * at a fixed hop: frame n ends at sample floor(n * sampleRate / hz). A quantum that straddles a frame end is split there. Frames are
 * keyed to the sample count, so the display's frame rate, a hidden tab or a busy main thread never change what is measured.
 */
export class FrameEmitter {
  private readonly frontEnd: FrontEnd
  private samples = 0
  private next = 1
  private wantsSpectrum = true

  constructor(private readonly sampleRate: number, private readonly hz: number = CAPTURE_HZ) {
    this.frontEnd = new FrontEnd(sampleRate)
  }

  /** Whether frames carry the pooled spectrum (an FFT a frame). Turn it off while nothing reads the riser and sweep. */
  setSpectrum = (on: boolean): void => {
    this.wantsSpectrum = on
  }

  private endOfFrame = (n: number): number => Math.floor((n * this.sampleRate) / this.hz)

  /** Feed a block of mono samples; returns the frames that ended inside it, in order. */
  push = (block: ArrayLike<number>): CaptureFrame[] => {
    const frames: CaptureFrame[] = []
    let from = 0
    while (from < block.length) {
      const room = this.endOfFrame(this.next) - this.samples
      const take = Math.min(block.length - from, Math.max(0, room))
      if (take > 0) {
        this.frontEnd.push(view(block, from, from + take))
        this.samples += take
        from += take
      }
      if (this.samples < this.endOfFrame(this.next)) continue
      const { levels, energy, spectrum } = this.frontEnd.read(this.wantsSpectrum)
      const frame: CaptureFrame = { index: this.next, levels, energy }
      if (spectrum) frame.spectrum = Uint8Array.from(spectrum)
      frames.push(frame)
      this.next++
    }
    return frames
  }
}
