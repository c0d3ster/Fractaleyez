import { DRUM_SENSITIVITY } from '../drums'
import { DEFAULT_ENABLED_BANDS, ONSET_BANDS, OnsetDetector } from '../onset'
import type { OnsetReading } from '../onset'
import type { Analysers } from './analysers'

/** One frame of input. Its time comes from the audio clock (the sample count over the sample rate, or the audio context's time), not from when a frame was drawn. */
export type AudioFrame = {
  /** The frame's time in ms on the audio clock; the same clock for every frame of a run. */
  t: number
  /** Ms since the previous frame (the first frame's own length). */
  deltaMs: number
  /** The five onset band levels, RMS in percent of full scale. */
  levels: number[]
  /** Mean time-domain deviation, 0 for silence. Gates the analysers until the first sound and goes to the beat's energy. */
  energy: number
  /** The 40 pooled spectrum bands, for the sweep detector. Only read while the riser and sweep are wanted (`AudioFeed.wantsSpectrum`). */
  spectrum?: ArrayLike<number>
}

/** The settings the beat reads, taken each frame so a slider can change them live. */
export type FeedSettings = {
  /** Threshold: higher asks for a bigger jump over the recent maximum. */
  sensitivity: number
  /** Ms after a beat during which another can't fire. */
  ignoreMs: number
  /** Which bands may set off a beat. */
  enabledBands: boolean[]
  /** Ms the beat value takes to fall from 1 to 0. */
  decayMs: number
}

export const DEFAULT_FEED_SETTINGS: FeedSettings = { sensitivity: 2, ignoreMs: 250, enabledBands: DEFAULT_ENABLED_BANDS, decayMs: 300 }

export type AudioFeedOptions = {
  /** The beat settings, read every frame. Default: DEFAULT_FEED_SETTINGS. */
  settings?: () => FeedSettings
  /**
   * Whether anything is reading the riser and sweep scores right now. While it says no, the sweep's spectrum is not needed and both
   * detectors are skipped, and their histories restart when it says yes again so stale slots are not read as the music. Default: always.
   */
  readsRiserAndSweep?: () => boolean
}

export type FeedResult = {
  /** The onset detector's reading for this frame: the beat, per-band readings, the analysis beat. */
  onset: OnsetReading
}

/**
 * The driver: pushes each audio frame into the analysers in a fixed order and owns the one definition of a beat (a drum onset, see
 * OnsetDetector). It reads no globals and no clock: settings are options, and every time comes in on the frame.
 */
export class AudioFeed {
  private readonly onsetDetector = new OnsetDetector(ONSET_BANDS.length)
  private heardSound = false
  private ranRiserAndSweep = true

  constructor(private readonly analysers: Analysers, private readonly options: AudioFeedOptions = {}) {}

  /** Whether the next frame should carry the pooled spectrum. */
  wantsSpectrum = (): boolean => this.options.readsRiserAndSweep?.() ?? true

  /** True until the first frame with sound, e.g. while a browser audio context waits for a click. */
  isSilent = (): boolean => !this.heardSound

  /** Run one frame through every analyser. */
  push = ({ t, deltaMs, levels, energy, spectrum }: AudioFrame): FeedResult => {
    const { beatMonitor, tempoTracker, beatGrid, sectionTracker, drumHits, riserDetector, sweepDetector } = this.analysers
    const { sensitivity, ignoreMs, enabledBands, decayMs } = this.options.settings?.() ?? DEFAULT_FEED_SETTINGS
    const onset = this.onsetDetector.update(levels, deltaMs, energy, {
      enabledBands,
      sensitivity,
      ignoreMs,
      decayMs,
      // With no steady rhythm (no music, or a fan), the detector's noise gates come on; see OnsetDetectorOptions.
      rhythm: tempoTracker.getReading() !== null,
    })
    beatMonitor.record({ t, bands: onset.bands, beatBand: onset.beatBand, rebandTo: onset.rebandTo })
    // Not before the first sound: the drum warm-up and the riser's and sweep's histories would otherwise pass on silence, and the music
    // coming up from it would read as a hit in every band and as a rise.
    if (!this.heardSound && energy) this.heardSound = true
    if (this.heardSound) {
      drumHits.push(t, levels, deltaMs, DRUM_SENSITIVITY)
      const reads = this.wantsSpectrum()
      if (reads && !this.ranRiserAndSweep) {
        riserDetector.reset()
        sweepDetector.reset()
      }
      this.ranRiserAndSweep = reads
      if (reads) {
        riserDetector.push(t, levels)
        if (spectrum) sweepDetector.push(t, spectrum)
      }
    }
    tempoTracker.push(t, levels)
    // After the tracker, so the grid reads this frame's tempo.
    beatGrid.push(t, levels)
    // The raw band levels, as the section model was trained and scored on (the onset detector's followed levels blur its tick features), and
    // the BPM now shown, for the tempo-change song cue. Its beats are the analysis beat, on the fixed settings it was trained with (ANALYSIS_ONSET).
    sectionTracker.push({ t, levels, beat: onset.analysisBeat, bpm: tempoTracker.getBpm() })
    return { onset }
  }
}
