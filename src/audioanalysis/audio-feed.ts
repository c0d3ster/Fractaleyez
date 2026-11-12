import { DEFAULT_ENABLED_BANDS, DRUM_SENSITIVITY, ONSET_BANDS, OnsetDetector, SpectrumReducer } from 'beatsense'
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
 * Single producer of analysed audio. Runs the stream -> analyser pipeline exactly once per frame and
 * hands the same read-only snapshot to every consumer (visualizers, HUDs), so adding more active
 * modes never means more analysis passes and no consumer owns shared audio state. It also owns the one
 * definition of a beat (a drum onset, see beatsense's OnsetDetector) and feeds the audio HUD's timeline, pushing each frame into the
 * app's analysers (`analysis`, src/audio.ts) in a fixed order.
 */
export class AudioFeed {
  private latest: AudioAnalysedDataForVisualization | null = null
  private readonly onsetDetector = new OnsetDetector(ONSET_BANDS.length)
  private spectrumReducer: SpectrumReducer | null = null
  private heardSound = false
  private ranRiserAndSweep = true

  constructor(
    private readonly stream: AudioFeedStream,
    private readonly analyser: AudioAnalyser,
    private readonly analysis: AudioAnalysis,
    private readonly options: AudioFeedOptions = {},
  ) {}

  /** Analyse the current audio frame. Call once per animation frame. */
  tick = (deltaTime: number, currentTimer: Date): AudioAnalysedDataForVisualization => {
    const { beatMonitor, tempoTracker, beatGrid, sectionTracker, drumHits, riserDetector, sweepDetector } = this.analysis
    const audioData = this.stream.getAudioData()
    this.analyser.analyse(audioData, deltaTime, currentTimer)
    const snapshot = this.analyser.getAnalysedDataForVisualization()

    const { soundThreshold, ignoreTime } = window.config.audio
    const levels = this.stream.getBandLevels()
    const onset = this.onsetDetector.update(levels, deltaTime, this.analyser.getAnalysedData().getEnergy(), {
      enabledBands: window.enabledFreqBands ?? DEFAULT_ENABLED_BANDS,
      sensitivity: soundThreshold.value,
      ignoreMs: ignoreTime.value,
      decayMs: AnalyserConfig.options.peakDetection.options.peakPersistency,
      // With no steady rhythm (no music, or a fan), the detector's noise gates come on; see OnsetDetectorOptions.
      rhythm: tempoTracker.getReading() !== null,
    })
    snapshot.beat = onset.beat
    const now = performance.now()
    beatMonitor.record({ t: now, bands: onset.bands, beatBand: onset.beatBand, rebandTo: onset.rebandTo })
    // Not before the first sound (the audio context waits for a click): the drum warm-up and the riser's and sweep's histories would
    // otherwise pass on silence, and the music coming up from it would read as a hit in every band and as a rise.
    if (!this.heardSound && !this.isSilent()) this.heardSound = true
    if (this.heardSound) {
      drumHits.push(now, levels, deltaTime, DRUM_SENSITIVITY)
      const reads = this.options.readsRiserAndSweep?.() ?? true
      if (reads && !this.ranRiserAndSweep) {
        riserDetector.reset()
        sweepDetector.reset()
      }
      this.ranRiserAndSweep = reads
      if (reads) {
        riserDetector.push(now, levels)
        // The spectrum pooled into the training recorder's 40 bands, for the sweep detector.
        if (!this.spectrumReducer) {
          const { sampleRate, binCount } = this.stream.getSpectrumShape()
          this.spectrumReducer = new SpectrumReducer(sampleRate, binCount)
        }
        sweepDetector.push(now, this.spectrumReducer.reduce(audioData.frequencyData))
      }
    }
    tempoTracker.push(now, levels)
    // After the tracker, so the grid reads this frame's tempo.
    beatGrid.push(now, levels)
    // The raw band levels, as the section model was trained and scored on (the onset detector's followed levels blur its tick features), and
    // the BPM now shown, for the tempo-change song cue. Its beats are the analysis beat, on the fixed settings it was trained with (ANALYSIS_ONSET).
    sectionTracker.push({ t: now, levels, beat: onset.analysisBeat, bpm: tempoTracker.getBpm() })

    this.latest = snapshot
    return snapshot
  }

  getLatest = (): AudioAnalysedDataForVisualization | null => this.latest

  /** True while the analyser sees silence, e.g. before a click lets the audio context start. */
  isSilent = (): boolean => !this.analyser.getAnalysedData().getEnergy()
}
