import { AudioStream } from '../audiostream/audio-stream'
import { AudioAnalyser } from './audio-analyser'
import { AudioAnalysedDataForVisualization } from './audio-analysed-data'

/**
 * Single producer of analysed audio. Runs the stream -> analyser pipeline exactly once per frame and
 * hands the same read-only snapshot to every consumer (visualizers, HUDs), so adding more active
 * modes never means more analysis passes and no consumer owns shared audio state.
 */
export class AudioFeed {
  private latest: AudioAnalysedDataForVisualization | null = null

  constructor(
    private readonly stream: AudioStream,
    private readonly analyser: AudioAnalyser,
  ) {}

  /** Analyse the current audio frame. Call once per animation frame. */
  tick = (deltaTime: number, currentTimer: Date): AudioAnalysedDataForVisualization => {
    this.analyser.analyse(this.stream.getAudioData(), deltaTime, currentTimer)
    this.latest = this.analyser.getAnalysedDataForVisualization()
    return this.latest
  }

  getLatest = (): AudioAnalysedDataForVisualization | null => this.latest

  /** True while the analyser sees silence, e.g. before a click lets the audio context start. */
  isSilent = (): boolean => !this.analyser.getAnalysedData().getEnergy()
}
