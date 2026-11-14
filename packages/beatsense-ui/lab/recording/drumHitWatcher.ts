import { DRUM_KINDS, type DrumKind } from 'beatsense'

import type { DrumDetection } from './sessionFile'

/** The drum model's newest hit time per drum, as DrumHits.getLastHits gives it. */
export type LastDrumHits = Readonly<Record<DrumKind, number | null>>

/**
 * Turns DrumHits.getLastHits, which repeats the newest hit per drum every frame, into each hit once. Hits from before `fromMs` (set at a
 * reset) are skipped, so a recording does not start with the last hit before it.
 */
export class DrumHitWatcher {
  private seen: Partial<Record<DrumKind, number>> = {}
  private fromMs = Number.NEGATIVE_INFINITY

  reset = (fromMs: number = Number.NEGATIVE_INFINITY): void => {
    this.seen = {}
    this.fromMs = fromMs
  }

  /** The hits new since the last call, in drum order. */
  newHits = (lastHits: LastDrumHits): DrumDetection[] => {
    const hits: DrumDetection[] = []
    DRUM_KINDS.forEach((kind) => {
      const t = lastHits[kind]
      if (t === null || t < this.fromMs || t === this.seen[kind]) return
      this.seen[kind] = t
      hits.push({ kind, t })
    })
    return hits
  }
}
