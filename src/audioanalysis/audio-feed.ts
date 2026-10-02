import { AudioStream } from '../audiostream/audio-stream'
import { AudioAnalyser } from './audio-analyser'
import { AudioAnalysedDataForVisualization } from './audio-analysed-data'
import { BEAT_ACTIVE_LEVEL, BeatState, beatMonitor } from './beat'

/**
 * Single producer of analysed audio. Runs the stream -> analyser pipeline exactly once per frame and
 * hands the same read-only snapshot to every consumer (visualizers, HUDs), so adding more active
 * modes never means more analysis passes and no consumer owns shared audio state. It also owns the one
 * definition of a beat (see beat.ts) and feeds the audio HUD's timeline.
 */
export class AudioFeed {
  private latest: AudioAnalysedDataForVisualization | null = null
  private lastBeatTimer: Date | null = null

  constructor(
    private readonly stream: AudioStream,
    private readonly analyser: AudioAnalyser,
  ) {}

  /** Analyse the current audio frame. Call once per animation frame. */
  tick = (deltaTime: number, currentTimer: Date): AudioAnalysedDataForVisualization => {
    this.analyser.analyse(this.stream.getAudioData(), deltaTime, currentTimer)
    const snapshot = this.analyser.getAnalysedDataForVisualization()
    snapshot.beat = this.readBeat(snapshot)
    this.latest = snapshot
    return snapshot
  }

  getLatest = (): AudioAnalysedDataForVisualization | null => this.latest

  /** True while the analyser sees silence, e.g. before a click lets the audio context start. */
  isSilent = (): boolean => !this.analyser.getAnalysedData().getEnergy()

  // The analyser stamps a new Date on the peak each time it detects one, so a changed timer is a fresh beat.
  private readBeat = (snapshot: AudioAnalysedDataForVisualization): BeatState => {
    const { peak } = snapshot
    const fresh = peak?.timer != null && peak.timer !== this.lastBeatTimer
    this.lastBeatTimer = peak?.timer ?? null

    beatMonitor.record({
      t: performance.now(),
      energy: snapshot.energy ?? 0,
      trigger: (snapshot.energyAverage ?? 0) * window.config.audio.soundThreshold.value,
      beat: fresh,
    })

    return { fresh, active: (peak?.value ?? 0) > BEAT_ACTIVE_LEVEL }
  }
}
