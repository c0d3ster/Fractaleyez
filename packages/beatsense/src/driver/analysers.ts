import { BEAT_NET_MODEL, BeatGrid } from '../grid'
import { BeatMonitor } from '../onset'
import { DrumHits } from '../drums'
import { RiserDetector, SweepDetector } from '../risers'
import { SectionTracker } from '../sections'
import { TempoTracker } from '../tempo'

/** The analysers the driver pushes every frame into, one of each. The package keeps no instances of its own, so the caller holds the set. */
export type Analysers = {
  beatMonitor: BeatMonitor
  tempoTracker: TempoTracker
  /** On `tempoTracker`, with the beat network for its phase. The driver pushes it each frame, right after the tracker. */
  beatGrid: BeatGrid
  sectionTracker: SectionTracker
  drumHits: DrumHits
  riserDetector: RiserDetector
  sweepDetector: SweepDetector
}

/** A fresh set wired the way the app runs it. `clock` is the beat monitor's, which defaults to `performance.now()`. */
export const createAnalysers = (clock?: () => number): Analysers => {
  const tempoTracker = new TempoTracker()
  return {
    beatMonitor: new BeatMonitor(clock),
    tempoTracker,
    beatGrid: new BeatGrid(tempoTracker, {}, BEAT_NET_MODEL),
    sectionTracker: new SectionTracker(),
    drumHits: new DrumHits(),
    riserDetector: new RiserDetector(),
    sweepDetector: new SweepDetector(),
  }
}
