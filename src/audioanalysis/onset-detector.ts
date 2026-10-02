/* eslint-disable max-classes-per-file */
import { BEAT_ACTIVE_LEVEL, BeatState } from './beat'

// A hit is a sudden rise in a band's level. Comparing a fast follower against a slow one makes a held note cancel
// out (both sit at the same level) while a drum hit on top of it still jumps ahead. A rise counts as a hit when it is
// a fraction of the strongest rise that band has had recently, so the bar follows the track and nothing here depends
// on how loud the input is (a quiet mic works the same as a loud one). Each band is tracked on its own (the kick in the
// low band, snare and clap in the mid band), and a hit in any of them is a beat.
const FAST_TAU_MS = 20
const SLOW_TAU_MS = 200
// The strongest recent rise jumps up instantly and fades over this long.
const STRONGEST_RISE_RELEASE_TAU_MS = 4000
// The Threshold slider (0 to 5) sets the fraction of the strongest rise a hit must reach: slider x this, kept in range.
const BAR_FRACTION_PER_SENSITIVITY = 0.2
const MIN_BAR_FRACTION = 0.05
const MAX_BAR_FRACTION = 0.95
// The rise must also be a real fraction of the current level (rejects wobble on a loud steady sound).
const MIN_RELATIVE_RISE = 0.06
// Digital-silence guard only (% of full scale); far below any real signal, so it never limits a quiet mic.
const MIN_ABSOLUTE_RISE = 0.01
const WARMUP_MS = 1000
const MAX_STEP_MS = 100
// Long memory of how loud the band has been (jumps up instantly, forgets slowly). The strongest-rise bar fades in
// seconds, so on its own it would treat small wiggles in a quiet passage as hits. Against this, a hit needs the band
// to be a real fraction of recent loudness, and its rise to be a real fraction of it too.
const LOUDNESS_RELEASE_TAU_MS = 20000
const MIN_LEVEL_OF_LOUDNESS = 0.3
const MIN_RISE_OF_LOUDNESS = 0.06

type OnsetParams = {
  /** Which bands may set off a beat (the Frequency HUD toggles). Disabled bands are still tracked, just not heard. */
  enabledBands: boolean[]
  /** The Threshold slider: higher asks for a bigger rise relative to the strongest recent one. */
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

class BandTracker {
  private fast = 0
  private slow = 0
  private loudness = 0
  private strongestRise = 0
  private wasAbove = false

  step = (level: number, dtMs: number, sensitivity: number): { above: boolean; risingEdge: boolean; reading: BandReading } => {
    this.fast = follow(this.fast, level, dtMs, FAST_TAU_MS)
    this.slow = follow(this.slow, level, dtMs, SLOW_TAU_MS)
    this.loudness = this.fast > this.loudness ? this.fast : follow(this.loudness, this.fast, dtMs, LOUDNESS_RELEASE_TAU_MS)
    const rise = Math.max(0, this.fast - this.slow)

    const barFraction = Math.min(MAX_BAR_FRACTION, Math.max(MIN_BAR_FRACTION, sensitivity * BAR_FRACTION_PER_SENSITIVITY))
    const bar = Math.max(barFraction * this.strongestRise, MIN_RELATIVE_RISE * this.slow, MIN_RISE_OF_LOUDNESS * this.loudness, MIN_ABSOLUTE_RISE)
    const levelGate = MIN_LEVEL_OF_LOUDNESS * this.loudness

    this.strongestRise = rise > this.strongestRise ? rise : follow(this.strongestRise, rise, dtMs, STRONGEST_RISE_RELEASE_TAU_MS)

    const above = rise > bar && this.fast >= levelGate
    const risingEdge = above && !this.wasAbove
    this.wasAbove = above
    return { above, risingEdge, reading: { level: this.fast, loudness: this.loudness, trigger: Math.max(this.slow + bar, levelGate) } }
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

    const steps = this.trackers.map((tracker, i) => tracker.step(levels[i] ?? 0, dtMs, params.sensitivity))
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
