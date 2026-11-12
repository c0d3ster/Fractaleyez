import { BEAT_NET_MODEL, BeatGrid, BeatMonitor, DrumHits, RiserDetector, SectionTracker, SweepDetector, TempoTracker } from 'beatsense'

/**
 * The app's analysers, one of each. The beatsense package keeps no instances of its own, so they are created here: AudioFeed pushes
 * every frame into them, main.ts hangs their getters on `window` for the HUDs, and the effects read the song section, tempo and drums.
 */
export type AudioAnalysis = {
  beatMonitor: BeatMonitor
  tempoTracker: TempoTracker
  /** On `tempoTracker`, with the beat network for its phase. AudioFeed pushes it each frame, right after the tracker. */
  beatGrid: BeatGrid
  sectionTracker: SectionTracker
  drumHits: DrumHits
  riserDetector: RiserDetector
  sweepDetector: SweepDetector
}

/** A fresh set, wired the way the app runs it (tests and replays build their own). */
export const createAudioAnalysis = (): AudioAnalysis => {
  const tempoTracker = new TempoTracker()
  return {
    beatMonitor: new BeatMonitor(),
    tempoTracker,
    beatGrid: new BeatGrid(tempoTracker, {}, BEAT_NET_MODEL),
    sectionTracker: new SectionTracker(),
    drumHits: new DrumHits(),
    riserDetector: new RiserDetector(),
    sweepDetector: new SweepDetector(),
  }
}

export const audioAnalysis = createAudioAnalysis()
