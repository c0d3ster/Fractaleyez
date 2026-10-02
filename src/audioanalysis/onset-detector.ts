/* eslint-disable max-classes-per-file */
import { BEAT_ACTIVE_LEVEL, BeatState } from './beat'

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
// The Threshold slider (0 to 5) is the rise in dB a hit must clear its reference by: slider x this, kept in range.
const DB_PER_SENSITIVITY = 1.5
const MIN_THRESHOLD_DB = 0.5
const MAX_THRESHOLD_DB = 9
// Long memory of how loud the band has been (jumps up instantly, forgets slowly). A band has to be a real fraction of
// it to fire, so wiggles in a quiet passage don't count.
const LOUDNESS_RELEASE_TAU_MS = 20000
const MIN_LEVEL_OF_LOUDNESS = 0.3
// Digital-silence guard only (% of full scale); far below any real signal, so it never limits a quiet mic.
const SILENCE_LEVEL = 0.02
const WARMUP_MS = 1000
const MAX_STEP_MS = 100
const HISTORY_SLOTS = 64

type OnsetParams = {
  /** Which bands may set off a beat (the Frequency HUD toggles). Disabled bands are still tracked, just not heard. */
  enabledBands: boolean[]
  /** The Threshold slider: higher asks for a bigger jump over the recent maximum. */
  sensitivity: number
  /** Time after a beat during which another can't fire (the Ignore Time slider). */
  ignoreMs: number
  /** How long the beat value takes to fall from 1 to 0. */
  decayMs: number
}

export type BandReading = {
  /** The band's level (% of full scale). */
  level: number
  /** How loud the band has been lately. */
  loudness: number
  /** The level the band had to pass to count as a hit. */
  trigger: number
}

export type OnsetReading = {
  beat: BeatState
  bands: BandReading[]
  /** Which band set off the beat on this frame, or null. */
  beatBand: number | null
}

const follow = (current: number, target: number, dtMs: number, tauMs: number): number =>
  current + (target - current) * (1 - Math.exp(-dtMs / tauMs))

const toDb = (level: number): number => 20 * Math.log10(Math.max(level, SILENCE_LEVEL / 10))
const fromDb = (db: number): number => 10 ** (db / 20)

class BandTracker {
  private fast = 0
  private loudness = 0
  private clockMs = 0
  private wasAbove = false
  // Ring buffer of recent levels in dB, for the max-filtered reference.
  private readonly times = new Float64Array(HISTORY_SLOTS)
  private readonly dbs = new Float64Array(HISTORY_SLOTS)
  private head = 0
  private count = 0

  step = (level: number, dtMs: number, thresholdDb: number): { risingEdge: boolean; reading: BandReading } => {
    this.clockMs += dtMs
    this.fast = follow(this.fast, level, dtMs, FAST_TAU_MS)
    this.loudness = this.fast > this.loudness ? this.fast : follow(this.loudness, this.fast, dtMs, LOUDNESS_RELEASE_TAU_MS)
    const db = toDb(this.fast)

    let referenceDb = -Infinity
    for (let n = 0; n < this.count; n++) {
      const slot = (this.head - 1 - n + HISTORY_SLOTS) % HISTORY_SLOTS
      const age = this.clockMs - (this.times[slot] ?? 0)
      if (age > REFERENCE_WINDOW_MS) break
      if (age >= REFERENCE_GUARD_MS) referenceDb = Math.max(referenceDb, this.dbs[slot] ?? -Infinity)
    }
    this.times[this.head] = this.clockMs
    this.dbs[this.head] = db
    this.head = (this.head + 1) % HISTORY_SLOTS
    this.count = Math.min(this.count + 1, HISTORY_SLOTS)

    const levelGate = MIN_LEVEL_OF_LOUDNESS * this.loudness
    const hasReference = Number.isFinite(referenceDb)
    const above = hasReference && db - referenceDb > thresholdDb && this.fast >= levelGate && this.fast >= SILENCE_LEVEL
    const risingEdge = above && !this.wasAbove
    this.wasAbove = above

    const referenceLevel = hasReference ? fromDb(referenceDb + thresholdDb) : levelGate
    return { risingEdge, reading: { level: this.fast, loudness: this.loudness, trigger: Math.max(referenceLevel, levelGate) } }
  }
}

export class OnsetDetector {
  private readonly trackers: BandTracker[]
  private clockMs = 0
  private lastBeatMs = -Infinity
  private beatEnergy = 0

  constructor(bandCount: number) {
    this.trackers = Array.from({ length: bandCount }, () => new BandTracker())
  }

  update = (levels: number[], deltaMs: number, fullBandEnergy: number, params: OnsetParams): OnsetReading => {
    const dtMs = Math.min(Math.max(deltaMs, 1), MAX_STEP_MS)
    this.clockMs += dtMs

    const thresholdDb = Math.min(MAX_THRESHOLD_DB, Math.max(MIN_THRESHOLD_DB, params.sensitivity * DB_PER_SENSITIVITY))
    const steps = this.trackers.map((tracker, i) => tracker.step(levels[i] ?? 0, dtMs, thresholdDb))
    const canFire = this.clockMs > WARMUP_MS && this.clockMs - this.lastBeatMs >= params.ignoreMs
    const edgeBand = steps.findIndex(({ risingEdge }, i) => risingEdge && (params.enabledBands[i] ?? false))
    const fresh = canFire && edgeBand >= 0
    if (fresh) {
      this.lastBeatMs = this.clockMs
      this.beatEnergy = fullBandEnergy
    }

    const value = Math.max(0, 1 - (this.clockMs - this.lastBeatMs) / params.decayMs)
    return {
      beat: { fresh, active: value > BEAT_ACTIVE_LEVEL, value, energy: this.beatEnergy },
      bands: steps.map(({ reading }) => reading),
      beatBand: fresh ? edgeBand : null,
    }
  }
}
