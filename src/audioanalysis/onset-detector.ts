/* eslint-disable max-classes-per-file */
import { BEAT_ACTIVE_LEVEL, BeatState } from './beat'
import { DEFAULT_ENABLED_BANDS } from './onset-bands'

// Onset detection per band, following what the literature recommends for real-time use (Bock et al., SuperFlux):
//  - Work in a log (dB) scale, so a hit is a ratio over what came before, the same for a quiet mic and a loud one, a
//    soft kick and a hard one. Linear levels make the bar depend on the track's loudness.
//  - Compare against the recent maximum (a max filter), not an average: wobble from sustained notes, vocals and room
//    noise hovers around its own peak and can't beat it, while a drum hit jumps clear above it.
//  - A hit is the rising edge of "clears the reference by Threshold dB", with a dead time after each beat.
// Each band is tracked on its own; a hit in any enabled band is a beat.
const FAST_TAU_MS = 20
// The reference is the highest level in this window before now, leaving out the most recent GUARD so the hit's own
// attack is not part of what it is compared to.
const REFERENCE_WINDOW_MS = 150
const REFERENCE_GUARD_MS = 40

/** Where a band tracker looks back for the level a hit is compared with: the newest `guardMs` left out, back to `windowMs`. */
export type ReferenceWindow = { windowMs: number; guardMs: number }
const BEAT_REFERENCE: ReferenceWindow = { windowMs: REFERENCE_WINDOW_MS, guardMs: REFERENCE_GUARD_MS }
// The Threshold slider (0 to 5) is the rise in dB a hit must clear its reference by: slider x this, kept in range.
const DB_PER_SENSITIVITY = 1.5
const MIN_THRESHOLD_DB = 0.5
const MAX_THRESHOLD_DB = 9
// Long memory of how loud the band has been (jumps up instantly, forgets slowly). A band has to be a real fraction of
// it to fire, so wiggles in a quiet passage don't count.
const LOUDNESS_RELEASE_TAU_MS = 20000
const MIN_LEVEL_OF_LOUDNESS = 0.25
// Digital-silence guard only (% of full scale); far below any real signal, so it never limits a quiet mic.
const SILENCE_LEVEL = 0.02
const WARMUP_MS = 1000
const HISTORY_SLOTS = 64

/**
 * The noise floor gate. Steady noise (a fan, room hiss) makes a narrow band's level swing a few dB from one window to the next on its own:
 * the bass band is only 110 Hz wide and read over 46 ms, so a fan read as 39 bass hits a minute against the 3 dB rise test alone. Each band
 * also follows its own floor (a running low percentile of its level), and a hit has to stand this far above it. Noise sits on its floor;
 * a kick stands well clear of the quieter moments between kicks.
 */
export type OnsetDetectorOptions = {
  /** How far over the band's floor a hit must be, in dB. 0 turns the gate off. */
  floorMarginDb: number
  /** Which percentile of the band's level the floor follows (0 to 1). */
  floorQuantile: number
  /** How fast the floor moves, in dB per second. */
  floorRateDbPerS: number
  /**
   * A bass hit also needs the lo band (150 to 500 Hz) to rise this much (dB over its own recent maximum) within the last few frames.
   * A kick's boom comes with its body; a swing of rumble in the bass band alone, which narrowband noise makes all the time, does not. 0 is off.
   */
  bassNeedsLoDb: number
}

// Applied only while no rhythm is heard (OnsetParams.rhythm false): with music playing they would cost real hits (the floor gate about 8% of
// them on EDM, the lo band rule a third of the bass hits), with only a fan they take its false hits from 39 a minute to 7 (2 on a laptop mic).
export const DEFAULT_ONSET_OPTIONS: OnsetDetectorOptions = { floorMarginDb: 6, floorQuantile: 0.2, floorRateDbPerS: 20, bassNeedsLoDb: 1 }
const COINCIDENCE_MS = 40

/**
 * The analysis beat: the onsets the section model was trained on (scripts/section-eval/dump-features.mts), read from the same band trackers
 * as the user's beat but on fixed settings (the default bands, Threshold 2, Ignore Time 250 ms, no noise gates), so the Frequency HUD toggles
 * and the Threshold and Ignore Time sliders change the beat the user sees without changing what the model counts. Retraining on other bands
 * scored no better, and feeding the model the user's selection instead cost up to 0.019 build F1 (see docs/implementation-plans/song-sections.md).
 */
export const ANALYSIS_ONSET = { enabledBands: DEFAULT_ENABLED_BANDS, sensitivity: 2, ignoreMs: 250 } as const

type OnsetParams = {
  /** Which bands may set off a beat (the Frequency HUD toggles). Disabled bands are still tracked, just not heard. */
  enabledBands: boolean[]
  /** The Threshold slider: higher asks for a bigger jump over the recent maximum. */
  sensitivity: number
  /** Time after a beat during which another can't fire (the Ignore Time slider). */
  ignoreMs: number
  /** How long the beat value takes to fall from 1 to 0. */
  decayMs: number
  /** Whether a steady rhythm is being heard (the tempo tracker shows a tempo). False turns on the noise gates in OnsetDetectorOptions; leaving it out keeps them off. */
  rhythm?: boolean
}

export type BandReading = {
  /** The band's level (% of full scale). */
  level: number
  /** How loud the band has been lately. */
  loudness: number
  /** The level the band had to pass to count as a hit. */
  trigger: number
  /** True on the frame this band's level first clears its trigger, whether or not the band may set off a beat (each band's own onsets). */
  rising: boolean
}

export type OnsetReading = {
  beat: BeatState
  bands: BandReading[]
  /** Which band set off the beat on this frame, or null. */
  beatBand: number | null
  /** True on the frame an analysis beat fires (ANALYSIS_ONSET), whatever the user's settings. */
  analysisBeat: boolean
}

/** The rise in dB a hit must clear its reference by, for the Threshold slider's value. */
export const thresholdDbFor = (sensitivity: number): number =>
  Math.min(MAX_THRESHOLD_DB, Math.max(MIN_THRESHOLD_DB, sensitivity * DB_PER_SENSITIVITY))
const ANALYSIS_THRESHOLD_DB = thresholdDbFor(ANALYSIS_ONSET.sensitivity)

const follow = (current: number, target: number, dtMs: number, tauMs: number): number =>
  current + (target - current) * (1 - Math.exp(-dtMs / tauMs))

const toDb = (level: number): number => 20 * Math.log10(Math.max(level, SILENCE_LEVEL / 10))
const fromDb = (db: number): number => 10 ** (db / 20)

/** One band's onsets: its level in dB against the recent maximum (see the notes at the top). Exported for the drum hit classifier's own window (drum-hits.ts). */
export class BandTracker {
  private floorDb: number | null = null

  constructor(
    private readonly options: OnsetDetectorOptions = DEFAULT_ONSET_OPTIONS,
    private readonly reference: ReferenceWindow = BEAT_REFERENCE,
    // The fraction of the band's loudness a hit has to reach. The drum classifier passes less: its model sorts out the candidates, and a quiet
    // hat after a loud snare is still a hat.
    private readonly minLevelOfLoudness: number = MIN_LEVEL_OF_LOUDNESS,
  ) {}

  private fast = 0
  private loudness = 0
  private clockMs = 0
  private wasAbove = false
  private wasAboveAnalysis = false
  // Ring buffer of recent levels in dB, for the max-filtered reference.
  private readonly times = new Float64Array(HISTORY_SLOTS)
  private readonly dbs = new Float64Array(HISTORY_SLOTS)
  private head = 0
  private count = 0

  /** The band's largest rise over its reference in the last COINCIDENCE_MS, in dB. */
  recentRiseDb = -Infinity
  private recentRiseAt = -Infinity

  step = (
    level: number,
    dtMs: number,
    thresholdDb: number,
    noiseGate: boolean,
  ): { risingEdge: boolean; analysisEdge: boolean; reading: BandReading } => {
    this.clockMs += dtMs
    this.fast = follow(this.fast, level, dtMs, FAST_TAU_MS)
    this.loudness = this.fast > this.loudness ? this.fast : follow(this.loudness, this.fast, dtMs, LOUDNESS_RELEASE_TAU_MS)
    const db = toDb(this.fast)

    let referenceDb = -Infinity
    for (let n = 0; n < this.count; n++) {
      const slot = (this.head - 1 - n + HISTORY_SLOTS) % HISTORY_SLOTS
      const age = this.clockMs - (this.times[slot] ?? 0)
      if (age > this.reference.windowMs) break
      if (age >= this.reference.guardMs) referenceDb = Math.max(referenceDb, this.dbs[slot] ?? -Infinity)
    }
    this.times[this.head] = this.clockMs
    this.dbs[this.head] = db
    this.head = (this.head + 1) % HISTORY_SLOTS
    this.count = Math.min(this.count + 1, HISTORY_SLOTS)

    const levelGate = this.minLevelOfLoudness * this.loudness
    const hasReference = Number.isFinite(referenceDb)
    // A quantile follower: up by q of a step when the level is over the floor, down by (1 - q) when under, so it settles on the q percentile.
    const { floorMarginDb, floorQuantile, floorRateDbPerS } = this.options
    const step = (floorRateDbPerS * dtMs) / 1000
    this.floorDb = this.floorDb === null ? db : this.floorDb + (db > this.floorDb ? floorQuantile * step : -(1 - floorQuantile) * step)
    const overFloor = !noiseGate || floorMarginDb <= 0 || db - this.floorDb >= floorMarginDb
    const loudEnough = hasReference && this.fast >= levelGate && this.fast >= SILENCE_LEVEL
    const above = loudEnough && db - referenceDb > thresholdDb && overFloor
    const risingEdge = above && !this.wasAbove
    this.wasAbove = above
    const aboveAnalysis = loudEnough && db - referenceDb > ANALYSIS_THRESHOLD_DB
    const analysisEdge = aboveAnalysis && !this.wasAboveAnalysis
    this.wasAboveAnalysis = aboveAnalysis
    const rise = hasReference ? db - referenceDb : -Infinity
    if (rise >= this.recentRiseDb || this.clockMs - this.recentRiseAt > COINCIDENCE_MS) {
      this.recentRiseDb = rise
      this.recentRiseAt = this.clockMs
    }

    const referenceLevel = hasReference ? fromDb(referenceDb + thresholdDb) : levelGate
    return { risingEdge, analysisEdge, reading: { level: this.fast, loudness: this.loudness, trigger: Math.max(referenceLevel, levelGate), rising: risingEdge } }
  }
}

export class OnsetDetector {
  private readonly trackers: BandTracker[]
  private readonly options: OnsetDetectorOptions
  private clockMs = 0
  private lastBeatMs = -Infinity
  private lastAnalysisBeatMs = -Infinity
  private beatEnergy = 0

  constructor(bandCount: number, options: Partial<OnsetDetectorOptions> = {}) {
    this.options = { ...DEFAULT_ONSET_OPTIONS, ...options }
    this.trackers = Array.from({ length: bandCount }, () => new BandTracker(this.options))
  }

  update = (levels: number[], deltaMs: number, fullBandEnergy: number, params: OnsetParams): OnsetReading => {
    const dtMs = Math.max(deltaMs, 1)
    this.clockMs += dtMs

    const thresholdDb = thresholdDbFor(params.sensitivity)
    const noiseGate = params.rhythm === false
    const steps = this.trackers.map((tracker, i) => tracker.step(levels[i] ?? 0, dtMs, thresholdDb, noiseGate))
    const canFire = this.clockMs > WARMUP_MS && this.clockMs - this.lastBeatMs >= params.ignoreMs
    const { bassNeedsLoDb } = this.options
    const loRise = this.trackers[1]?.recentRiseDb ?? Infinity
    const counts = (i: number): boolean => !noiseGate || i !== 0 || bassNeedsLoDb <= 0 || loRise >= bassNeedsLoDb
    const edgeBand = steps.findIndex(({ risingEdge }, i) => risingEdge && (params.enabledBands[i] ?? false) && counts(i))
    const fresh = canFire && edgeBand >= 0
    if (fresh) {
      this.lastBeatMs = this.clockMs
      this.beatEnergy = fullBandEnergy
    }

    const analysisBeat = this.clockMs > WARMUP_MS
      && this.clockMs - this.lastAnalysisBeatMs >= ANALYSIS_ONSET.ignoreMs
      && steps.some(({ analysisEdge }, i) => analysisEdge && ANALYSIS_ONSET.enabledBands[i])
    if (analysisBeat) this.lastAnalysisBeatMs = this.clockMs

    const value = Math.max(0, 1 - (this.clockMs - this.lastBeatMs) / params.decayMs)
    return {
      beat: { fresh, active: value > BEAT_ACTIVE_LEVEL, value, energy: this.beatEnergy },
      bands: steps.map(({ reading }) => reading),
      beatBand: fresh ? edgeBand : null,
      analysisBeat,
    }
  }
}
