import { BEAT_NET_MODEL, BeatGrid, BeatMonitor, DrumHits, RiserDetector, RollReader, SectionTracker, SweepDetector, TempoTracker, loadSectionModel } from 'beatsense'

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
  /** The snare roll's note value, ticked every frame (post-effects, read 20 times a second) whatever Auto is doing, so the Beat HUD shows it all the time. */
  snareRoll: RollReader
  /** Resolves once the section model (a lazy chunk) has loaded into `sectionTracker`, which idles until then. Tests await it. */
  sectionModelReady: Promise<void>
}

/** A fresh set, wired the way the app runs it (tests and replays build their own). */
export const createAudioAnalysis = (): AudioAnalysis => {
  const tempoTracker = new TempoTracker()
  const sectionTracker = new SectionTracker()
  return {
    beatMonitor: new BeatMonitor(),
    tempoTracker,
    beatGrid: new BeatGrid(tempoTracker, {}, BEAT_NET_MODEL),
    sectionTracker,
    drumHits: new DrumHits(),
    riserDetector: new RiserDetector(),
    sweepDetector: new SweepDetector(),
    snareRoll: new RollReader(),
    sectionModelReady: loadSectionModel().then(sectionTracker.setModel),
  }
}

export const audioAnalysis = createAudioAnalysis()

/** Tracks whether a getter was called lately: `wrap` returns the getter with a timestamp on each call, `isActive` says if one landed within `windowMs`. */
export const createReadWatch = (windowMs: number, clock: () => number = () => performance.now()): {
  wrap: <T>(read: () => T) => () => T
  isActive: () => boolean
} => {
  let lastReadMs = Number.NEGATIVE_INFINITY
  return {
    wrap: (read) => () => {
      lastReadMs = clock()
      return read()
    },
    isActive: () => clock() - lastReadMs <= windowMs,
  }
}
