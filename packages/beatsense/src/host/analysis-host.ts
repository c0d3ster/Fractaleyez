import { createAnalysers } from '../driver/analysers'
import type { Analysers } from '../driver/analysers'
import { AudioFeed, DEFAULT_FEED_SETTINGS } from '../driver/audio-feed'
import type { FeedSettings } from '../driver/audio-feed'
import type { FrameReading } from '../driver/analyze'
import { toAudioFrame } from '../worklet/frame-message'
import type { CaptureFrame } from '../worklet/frame-message'

/**
 * The detectors and the driver behind a frame-in, reading-out interface, so the same code runs in a Web Worker and, as the fallback,
 * on the main thread. Time is the frame's: the audio clock, never a wall clock, so the readings do not depend on where this runs.
 */
export class AnalysisHost {
  readonly analysers: Analysers
  private readonly feed: AudioFeed
  private settings: FeedSettings = DEFAULT_FEED_SETTINGS
  private spectrum = true
  private now = 0

  constructor() {
    this.analysers = createAnalysers(() => this.now)
    this.feed = new AudioFeed(this.analysers, { settings: () => this.settings, readsRiserAndSweep: () => this.spectrum })
  }

  setSettings = (settings: FeedSettings): void => {
    this.settings = settings
  }

  /** Whether the riser and sweep are read (and so the spectrum is wanted). */
  setSpectrum = (on: boolean): void => {
    this.spectrum = on
  }

  push = (frame: CaptureFrame): FrameReading => {
    const audioFrame = toAudioFrame(frame)
    this.now = audioFrame.t
    const { onset } = this.feed.push(audioFrame)
    const { tempoTracker, sectionTracker, riserDetector, sweepDetector } = this.analysers
    return {
      t: audioFrame.t,
      levels: audioFrame.levels,
      beat: onset.beat.fresh,
      beatBand: onset.beatBand,
      bpm: tempoTracker.getBpm(),
      section: sectionTracker.getState().section,
      riser: riserDetector.getScore(),
      sweep: sweepDetector.getScore(),
    }
  }
}
