import { BandTracker, ReferenceWindow, thresholdDbFor } from './onset-detector'

// The snare's hits for reading a roll (automode/roll-rate.ts), from its own trackers on the lo and mid bands. The beat detector compares a hit
// with the loudest level 40 to 150 ms before it, and a sixteenth at 128 BPM is only 117 ms after the last one: that hit's peak is still in the
// window, so an even roll never cleared it, and the HUD's onset list also merges hits under 100 ms apart. Here the window ends 70 ms back
// (sixteenths at 150 BPM are 100 ms apart, so the last hit's peak is always out of it) and hits only have to be 60 ms apart.
const ROLL_REFERENCE: ReferenceWindow = { windowMs: 70, guardMs: 25 }
const ROLL_BANDS = [1, 2] as const
const MIN_GAP_MS = 60
// rollLevel looks back 2.5 beats, about 2.3 s at 65 BPM, the slowest tempo the tracker shows.
const KEEP_MS = 3000
const BAND_COUNT = 5

/**
 * Runs every frame beside the beat detector, on the raw band levels, with the Threshold slider's rise. No noise gates: a roll is only read
 * while the tempo tracker shows a tempo, which is when the beat detector's gates are off too.
 */
export class RollOnsets {
  private readonly trackers = ROLL_BANDS.map(() => new BandTracker(undefined, ROLL_REFERENCE))
  private readonly onsets: number[][] = Array.from({ length: BAND_COUNT }, () => [])

  push = (t: number, levels: readonly number[], dtMs: number, sensitivity: number): void => {
    const thresholdDb = thresholdDbFor(sensitivity)
    ROLL_BANDS.forEach((band, i) => {
      const { risingEdge } = this.trackers[i]!.step(levels[band] ?? 0, Math.max(dtMs, 1), thresholdDb, false)
      const times = this.onsets[band]!
      const last = times[times.length - 1]
      if (risingEdge && (last === undefined || t - last >= MIN_GAP_MS)) times.push(t)
      while (times.length > 0 && t - times[0]! > KEEP_MS) times.shift()
    })
  }

  /** Each band's roll hits (ms, oldest first; only the lo and mid bands have any), as the roll reading takes them. Not a copy: do not keep it. */
  getOnsets = (): ReadonlyArray<readonly number[]> => this.onsets
}

export const rollOnsets = new RollOnsets()
