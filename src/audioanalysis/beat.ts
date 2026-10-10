/**
 * What counts as a beat, defined once: a drum onset found by the OnsetDetector (a sudden rise in the low band for the
 * kick or the mid band for snare and clap, past an adaptive bar, outside the Ignore Time of the previous beat). `fresh` is true only on the frame it is detected,
 * `value` then decays from 1 to 0, and `active` stays true while it is still high. `energy` is the full-band energy at
 * the hit, which scales the glow. Every effect that keys off a beat (Hopalong, Julia) reads this.
 */
export type BeatState = {
  fresh: boolean
  active: boolean
  value: number
  energy: number
}

export const NO_BEAT: BeatState = { fresh: false, active: false, value: 0, energy: 0 }

/** beat.value above this counts as "still in the beat". */
export const BEAT_ACTIVE_LEVEL = 0.8

export type BandSample = {
  level: number
  /** How loud the band has been lately (jumps up instantly, forgets over ~20s). Bars are drawn relative to it. */
  loudness: number
  /** The level the band had to pass to count as a hit. */
  trigger: number
}

export type BeatSample = {
  t: number
  bands: BandSample[]
  /** Index of the band that set off a beat on this frame, or null. */
  beatBand: number | null
}

export type BeatTimeline = {
  samples: BeatSample[]
}

const HISTORY_MS = 5000

/** Rolling record of what the detector saw and when it fired, for the audio HUDs. */
export class BeatMonitor {
  private samples: BeatSample[] = []
  private lastBeatTime: number | null = null

  record = (sample: BeatSample): void => {
    if (sample.beatBand !== null) this.lastBeatTime = sample.t
    this.samples.push(sample)
    this.trim(this.samples, sample.t)
  }

  getTimeline = (): BeatTimeline => ({ samples: this.samples.slice() })

  /** When the detector last fired, or null if it has not. A cheap read for anything that only needs to know a beat just landed; the timeline copies every sample. */
  getLastBeatTime = (): number | null => this.lastBeatTime

  // Trim in batches so a per-frame push is not a per-frame array shift.
  private trim = (items: Array<{ t: number }>, now: number): void => {
    const oldest = items[0]
    if (!oldest || now - oldest.t < HISTORY_MS * 1.25) return
    const keepFrom = items.findIndex(({ t }) => now - t <= HISTORY_MS)
    if (keepFrom > 0) items.splice(0, keepFrom)
  }
}

export const beatMonitor = new BeatMonitor()
