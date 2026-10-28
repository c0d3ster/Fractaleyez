/**
 * Set by the video layer when a decoded frame is ready to be uploaded; read by the draw loop, which can then draw ahead of the
 * frame cap (see `shouldDrawForVideoFrame`). Every draw clears it, since a draw uploads the newest frame.
 */
export class VideoFrameSignal {
  private pending = false

  mark = (): void => {
    this.pending = true
  }

  isPending = (): boolean => this.pending

  clear = (): void => {
    this.pending = false
  }
}

export const videoFrameSignal = new VideoFrameSignal()
