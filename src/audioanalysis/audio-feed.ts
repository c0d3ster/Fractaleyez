import { AudioStream, ONSET_BANDS } from '../audiostream/audio-stream'
import { analyserConfig as AnalyserConfig } from '../config/analyser.config'
import { AudioAnalyser } from './audio-analyser'
import { AudioAnalysedDataForVisualization } from './audio-analysed-data'
import { beatMonitor } from './beat'
import { OnsetDetector } from './onset-detector'

/**
 * Single producer of analysed audio. Runs the stream -> analyser pipeline exactly once per frame and
 * hands the same read-only snapshot to every consumer (visualizers, HUDs), so adding more active
 * modes never means more analysis passes and no consumer owns shared audio state. It also owns the one
 * definition of a beat (a drum onset, see onset-detector.ts) and feeds the audio HUD's timeline.
 */
export class AudioFeed {
  private latest: AudioAnalysedDataForVisualization | null = null
  private readonly onsetDetector = new OnsetDetector(ONSET_BANDS.length)

  constructor(
    private readonly stream: AudioStream,
    private readonly analyser: AudioAnalyser,
  ) {}

  /** Analyse the current audio frame. Call once per animation frame. */
  tick = (deltaTime: number, currentTimer: Date): AudioAnalysedDataForVisualization => {
    this.analyser.analyse(this.stream.getAudioData(), deltaTime, currentTimer)
    const snapshot = this.analyser.getAnalysedDataForVisualization()

    const { soundThreshold, ignoreTime } = window.config.audio
    const onset = this.onsetDetector.update(this.stream.getBandLevels(), deltaTime, snapshot.energy ?? 0, {
      sensitivity: soundThreshold.value,
      ignoreMs: ignoreTime.value,
      decayMs: AnalyserConfig.options.peakDetection.options.peakPersistency,
    })
    snapshot.beat = onset.beat
    beatMonitor.record({ t: performance.now(), bands: onset.bands, beatBand: onset.beatBand })

    this.latest = snapshot
    return snapshot
  }

  getLatest = (): AudioAnalysedDataForVisualization | null => this.latest

  /** True while the analyser sees silence, e.g. before a click lets the audio context start. */
  isSilent = (): boolean => !this.analyser.getAnalysedData().getEnergy()
}
