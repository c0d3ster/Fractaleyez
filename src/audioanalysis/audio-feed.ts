import { CAPTURE_HZ, AudioFeed as BeatsenseFeed, DEFAULT_ENABLED_BANDS, NO_BEAT, toAudioFrame, VisualMeter } from 'beatsense'
import type { BeatState, CaptureFrame } from 'beatsense'
import type { AudioAnalysis } from '../audio'
import { audioConfig } from '../config/audio.config'
import type { AudioSnapshot } from './audio-snapshot'
import { FrameClock } from './frame-clock'
import type { ByteSource } from './visual-tap'

export type AudioFeedOptions = {
  /**
   * Whether anything is reading the riser and sweep scores right now (the Frequency HUD). While it says no, the 40-band pooling and both
   * detectors are skipped, and their histories restart when it says yes again so stale slots are not read as the music. Default: always.
   */
  readsRiserAndSweep?: () => boolean
}

/**
 * The app's side of the analysis. `push` takes the frames the worklet measures (a fixed 60 a second, on the sample clock) and runs
 * beatsense's driver on each, so what the detectors hear never depends on the display's frame rate, the quality tier or a hidden tab.
 * `tick` runs once per drawn frame for the visuals (the analyser node's energy and bands) and hands every consumer the same
 * read-only snapshot carrying the newest beat. The sliders, the HUD's band toggles and the page clock come in here.
 */
export class AudioFeed {
  private latest: AudioSnapshot | null = null
  private readonly driver: BeatsenseFeed
  private readonly clock = new FrameClock()
  private readonly meter: VisualMeter
  private readonly snapshot: AudioSnapshot
  private beat: BeatState | null = null

  constructor(
    private readonly source: ByteSource,
    analysis: AudioAnalysis,
    options: AudioFeedOptions = {},
  ) {
    this.meter = new VisualMeter({ sampleRate: source.sampleRate, binCount: source.binCount })
    this.snapshot = { energy: 0, energyAverage: 0, bands: [], beat: NO_BEAT }
    this.driver = new BeatsenseFeed(analysis, {
      readsRiserAndSweep: options.readsRiserAndSweep,
      settings: () => {
        const { soundThreshold, ignoreTime } = window.config.audio
        return {
          sensitivity: soundThreshold.value,
          ignoreMs: ignoreTime.value,
          enabledBands: window.enabledFreqBands ?? DEFAULT_ENABLED_BANDS,
          decayMs: audioConfig.beatDecayMs,
        }
      },
    })
  }

  /** Whether the next frame should carry the pooled spectrum. */
  wantsSpectrum = (): boolean => this.driver.wantsSpectrum()

  /** Run one measured frame through the analysers. Call for every frame the worklet posts, in order. */
  push = (frame: CaptureFrame, nowMs: number = performance.now()): void => {
    const audioFrame = toAudioFrame(frame, CAPTURE_HZ)
    const { onset } = this.driver.push({ ...audioFrame, t: this.clock.toPageMs(audioFrame.t, nowMs) })
    // A beat is fresh for one frame, and several frames can pass between two draws: keep it until the next draw reads it.
    this.beat = this.beat?.fresh && !onset.beat.fresh ? { ...onset.beat, fresh: true } : onset.beat
  }

  /** The visuals' side of one drawn frame. Call once per animation frame; the returned object is reused, so read it within the frame. */
  tick = (deltaTime: number): AudioSnapshot => {
    const { timeDomain, frequency } = this.source.read()
    const { energy, energyAverage, bands } = this.meter.read(timeDomain, frequency, deltaTime)
    const { snapshot } = this
    snapshot.energy = energy
    snapshot.energyAverage = energyAverage
    snapshot.bands = bands
    if (this.beat) {
      snapshot.beat = this.beat
      this.beat = { ...this.beat, fresh: false }
    }
    this.latest = snapshot
    return snapshot
  }

  getLatest = (): AudioSnapshot | null => this.latest

  /** True until the first frame with sound, e.g. while a click is still needed to let the audio context start. */
  isSilent = (): boolean => this.driver.isSilent()
}
