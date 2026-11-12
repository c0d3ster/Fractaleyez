import { AudioFeed as BeatsenseFeed, DEFAULT_ENABLED_BANDS, SpectrumReducer } from 'beatsense'
import type { AudioAnalysis } from '../audio'
import { AudioStream } from '../audiostream/audio-stream'
import { analyserConfig as AnalyserConfig } from '../config/analyser.config'
import { AudioAnalyser } from './audio-analyser'
import { AudioAnalysedDataForVisualization } from './audio-analysed-data'

/** What the feed reads from the stream each frame (an AudioStream, or a recording or synthetic source in a test). */
export type AudioFeedStream = Pick<AudioStream, 'getAudioData' | 'getBandLevels' | 'getSpectrumShape'>

export type AudioFeedOptions = {
  /**
   * Whether anything is reading the riser and sweep scores right now (the Frequency HUD). While it says no, the 40-band pooling and both
   * detectors are skipped, and their histories restart when it says yes again so stale slots are not read as the music. Default: always.
   */
  readsRiserAndSweep?: () => boolean
}

/**
 * The app's side of the analysis: single producer of analysed audio. Runs the stream -> analyser pipeline exactly once per frame and
 * hands the same read-only snapshot to every consumer (visualizers, HUDs), so adding more active modes never means more analysis passes
 * and no consumer owns shared audio state. The frame's analysis itself (the beat and every analyser's push, in a fixed order) is
 * beatsense's driver; this reads the app's globals (the sliders, the HUD's band toggles) and the wall clock into it.
 */
export class AudioFeed {
  private latest: AudioAnalysedDataForVisualization | null = null
  private readonly driver: BeatsenseFeed
  private spectrumReducer: SpectrumReducer | null = null

  constructor(
    private readonly stream: AudioFeedStream,
    private readonly analyser: AudioAnalyser,
    analysis: AudioAnalysis,
    options: AudioFeedOptions = {},
  ) {
    this.driver = new BeatsenseFeed(analysis, {
      readsRiserAndSweep: options.readsRiserAndSweep,
      settings: () => {
        const { soundThreshold, ignoreTime } = window.config.audio
        return {
          sensitivity: soundThreshold.value,
          ignoreMs: ignoreTime.value,
          enabledBands: window.enabledFreqBands ?? DEFAULT_ENABLED_BANDS,
          decayMs: AnalyserConfig.options.peakDetection.options.peakPersistency,
        }
      },
    })
  }

  /** Analyse the current audio frame. Call once per animation frame. */
  tick = (deltaTime: number, currentTimer: Date): AudioAnalysedDataForVisualization => {
    const audioData = this.stream.getAudioData()
    this.analyser.analyse(audioData, deltaTime, currentTimer)
    const snapshot = this.analyser.getAnalysedDataForVisualization()
    const energy = this.analyser.getAnalysedData().getEnergy()
    // The spectrum pooled into the training recorder's 40 bands, for the sweep detector; not before the first sound, and not while unread.
    let spectrum: Uint8Array | undefined
    if (this.driver.wantsSpectrum() && (energy || !this.driver.isSilent())) {
      if (!this.spectrumReducer) {
        const { sampleRate, binCount } = this.stream.getSpectrumShape()
        this.spectrumReducer = new SpectrumReducer(sampleRate, binCount)
      }
      spectrum = this.spectrumReducer.reduce(audioData.frequencyData)
    }
    // The app keeps the wall clock for the analysers' time (its AudioStream has no sample counter yet); the package only needs it steady.
    const { onset } = this.driver.push({ t: performance.now(), deltaMs: deltaTime, levels: this.stream.getBandLevels(), energy, spectrum })
    snapshot.beat = onset.beat
    this.latest = snapshot
    return snapshot
  }

  getLatest = (): AudioAnalysedDataForVisualization | null => this.latest

  /** True while the analyser sees silence, e.g. before a click lets the audio context start. */
  isSilent = (): boolean => !this.analyser.getAnalysedData().getEnergy()
}
