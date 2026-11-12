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
  /** True on the frame the band's level first clears its trigger (see OnsetDetector), for each band's own onsets. */
  rising?: boolean
}

export type BeatSample = {
  t: number
  bands: BandSample[]
  /** Index of the band that set off a beat on this frame, or null. */
  beatBand: number | null
  /** The band the last beat belongs to after all, on the frame a lower band's own hit shows it (see OnsetReading.rebandTo), or null. */
  rebandTo?: number | null
}

export type BeatTimeline = {
  /** The monitor's own history, oldest first: read it where it is called and do not keep it, since it keeps growing and being trimmed. */
  samples: readonly BeatSample[]
}

const HISTORY_MS = 5000
// Enough beats to read a tempo from, a few bars at any usual speed.
const TEMPO_HISTORY_MS = 12000
// A band's own onsets closer than this are one hit (the same dead time the rhythm names were measured with, see rhythm-pattern.ts).
const BAND_ONSET_GAP_MS = 100

/** Rolling record of what the detector saw and when it fired, for the audio HUDs. */
export class BeatMonitor {
  private samples: BeatSample[] = []
  private lastBeatTime: number | null = null
  private beatTimes: number[] = []
  private bandOnsets: number[][] = []
  private readonly listeners = new Set<() => void>()

  record = (sample: BeatSample): void => {
    this.samples.push(sample)
    this.trim(this.samples, sample.t)
    this.recordBandOnsets(sample)
    if (sample.beatBand === null) return
    this.lastBeatTime = sample.t
    this.beatTimes.push(sample.t)
    this.beatTimes = this.beatTimes.filter((time) => sample.t - time <= TEMPO_HISTORY_MS)
    // A listener can belong to a window that has since closed; one that throws is dropped so it never reaches the render loop.
    this.listeners.forEach((listener) => {
      try {
        listener()
      } catch {
        this.listeners.delete(listener)
      }
    })
  }

  /** Calls `listener` on the frame each beat is detected, so a consumer can react without polling every frame. Returns the unsubscribe. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  // Not a copy: the HUDs read it every tick, and 5 seconds of frames is a lot to copy 20 times a second.
  getTimeline = (): BeatTimeline => ({ samples: this.samples })

  /** When the detector last fired, or null if it has not. A cheap read for anything that only needs to know a beat just landed; the timeline copies every sample. */
  getLastBeatTime = (): number | null => this.lastBeatTime

  /** When each recent beat landed (the last few seconds' worth), oldest first, for reading a tempo from. */
  getBeatTimes = (): readonly number[] => {
    // Trimmed on read as well as on each beat, so the tempo goes away when the beats stop instead of showing the last one forever.
    const oldest = performance.now() - TEMPO_HISTORY_MS
    return this.beatTimes.filter((time) => time >= oldest)
  }

  /** Each band's own onsets over the last few seconds (ms, oldest first), one list per band: what the kick, the snare and the hats are doing, which the merged beats cannot say. */
  getBandOnsets = (): ReadonlyArray<readonly number[]> => {
    const oldest = performance.now() - TEMPO_HISTORY_MS
    return this.bandOnsets.map((times) => times.filter((time) => time >= oldest))
  }

  private recordBandOnsets = ({ t, bands }: BeatSample): void => {
    bands.forEach(({ rising }, band) => {
      const times = this.bandOnsets[band] ?? (this.bandOnsets[band] = [])
      const last = times[times.length - 1]
      if (rising && (last === undefined || t - last >= BAND_ONSET_GAP_MS)) times.push(t)
      // Trimmed in batches, like the samples.
      const oldest = times[0]
      if (oldest !== undefined && t - oldest > TEMPO_HISTORY_MS * 1.25) this.bandOnsets[band] = times.filter((time) => t - time <= TEMPO_HISTORY_MS)
    })
  }

  // Trim in batches so a per-frame push is not a per-frame array shift.
  private trim = (items: Array<{ t: number }>, now: number): void => {
    const oldest = items[0]
    if (!oldest || now - oldest.t < HISTORY_MS * 1.25) return
    const keepFrom = items.findIndex(({ t }) => now - t <= HISTORY_MS)
    if (keepFrom > 0) items.splice(0, keepFrom)
  }
}
