import type { FrameReading } from 'beatsense'

import { DrumHitWatcher, type LastDrumHits } from './drumHitWatcher'
import type { DrumDetection } from './sessionFile'
import { frameIndexAt } from './timeline'

/** As much as the strips can show: the Section HUD's widest view (2 minutes), with a little to spare. */
export const HISTORY_MS = 125000

// Dropping old entries one by one would shift the whole list each frame; they go in batches of about two seconds instead.
const TRIM_BATCH = 120

/**
 * The model's output over the last couple of minutes, kept whether or not a session records, so the strips under the HUDs can show the
 * model alone before Record (the variant without your labels). Frames come in time order.
 */
export class RecentHistory {
  private frames: FrameReading[] = []
  private drumHits: DrumDetection[] = []
  private readonly watcher = new DrumHitWatcher()

  constructor(private readonly keepMs: number = HISTORY_MS) {}

  /** Keeps one reading (copied, like the recorder) and any drum hit new since the last frame, and drops what is older than keepMs. */
  push = (reading: FrameReading, lastHits?: LastDrumHits): void => {
    this.frames.push({ ...reading, levels: [...reading.levels] })
    if (lastHits) this.watcher.newHits(lastHits).forEach((hit) => this.drumHits.push(hit))
    const cutoff = reading.t - this.keepMs
    const staleFrames = frameIndexAt(this.frames, cutoff)
    if (staleFrames >= TRIM_BATCH) this.frames.splice(0, staleFrames)
    const firstFresh = this.drumHits.findIndex(({ t }) => t >= cutoff)
    const staleHits = firstFresh < 0 ? this.drumHits.length : firstFresh
    if (staleHits >= TRIM_BATCH) this.drumHits.splice(0, staleHits)
  }

  /** The frames from `t` on (a new list). */
  framesSince = (t: number): FrameReading[] => this.frames.slice(frameIndexAt(this.frames, t))

  /** The drum hits kept (live, not a copy), oldest first give or take a frame. */
  getDrumHits = (): readonly DrumDetection[] => this.drumHits

  /** The newest frame's time, or null before any. */
  newestMs = (): number | null => this.frames[this.frames.length - 1]?.t ?? null

  size = (): number => this.frames.length
}
