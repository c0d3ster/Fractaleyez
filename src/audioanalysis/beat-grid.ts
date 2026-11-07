/* eslint-disable max-classes-per-file */
// Where the beats, bars and phrases fall, causally, on top of the tempo tracker: the grid EDM is built on.
//
// Raveform's 1,423 annotated EDM tracks (see docs/implementation-plans/bar-grid.md) are all in 4/4, every section starts on a downbeat,
// 73% of them on an 8-bar line, and 83 to 93% of sections last a multiple of 8 bars. So knowing beat 1 and the 8-bar line says when a
// drop or a breakdown can start, which is what the section tracker is missing.
//
//  1. Beat clock. The tempo tracker gives the period. Every 250 ms the last 8 s of onset strength (on a 5 ms grid, lightly smoothed) is
//     scored against every phase of that period; the clock is nudged toward the best one (a small error) or re-anchored on it (a large one
//     that persists). A beat event fires on the frame the clock passes a beat.
//  2. Downbeat. At each beat: where the claps and snares land (beats 2 and 4 in dance music), how much the sound changed across the beat
//     (bar lines change most: a new bass note, a crash, a new loop) and how heavy the kick is. Each is kept per position in the bar with a
//     slow decay; the downbeat is the position whose evidence wins, and it moves only after winning for a while.
//  3. Phrase. At each bar line, how much the sound changed from the bar before to the bar after, kept per position in an 8-bar cycle;
//     the phrase line is the position with the most change.
import { TempoTracker } from './tempo-tracker'

export type GridState = {
  /** Beats since the grid locked, counting the current one. */
  beat: number
  /** 1 to 4: the current beat's place in its bar. */
  beatInBar: number
  /** 1 to 8: the current bar's place in its 8-bar phrase. */
  barInPhrase: number
  periodMs: number
  lastBeatMs: number
  nextBeatMs: number
  /** How clearly each layer stands out, 0 to 1 (the best hypothesis against the mean of the others). */
  downbeatConfidence: number
  phraseConfidence: number
}

export type BeatGridOptions = {
  phaseWindowMs: number
  phaseEveryMs: number
  /** How much of a small phase error is corrected each update, and what counts as small (share of a beat). */
  phaseFollow: number
  phaseJump: number
  /** A large error has to persist this many updates before the clock re-anchors. */
  phaseJumpUpdates: number
  /** Memory of the downbeat and phrase evidence, in bars. */
  downbeatMemoryBars: number
  phraseMemoryBars: number
  clapWeight: number
  changeWeight: number
  kickWeight: number
  /** A different downbeat or phrase line takes over once it has led for this many bars. */
  switchBars: number
  /** How late the onsets arrive after the sound that makes them (band filters and level windows), taken off the beat times. */
  latencyMs: number
}

export const DEFAULT_GRID_OPTIONS: BeatGridOptions = {
  phaseWindowMs: 8000,
  phaseEveryMs: 250,
  phaseFollow: 0.3,
  phaseJump: 0.15,
  phaseJumpUpdates: 4,
  downbeatMemoryBars: 8,
  phraseMemoryBars: 24,
  clapWeight: 1,
  changeWeight: 1,
  kickWeight: 0.5,
  switchBars: 2,
  latencyMs: 25,
}

const BANDS = 5
const BIN_MS = 5
const SMOOTH_BINS = 4
const GUARD_BINS = 12
const RECENT_MS = 2000
const BEATS_PER_BAR = 4
const BARS_PER_PHRASE = 8
const FLOOR_DB = -60

const toDb = (level: number): number => Math.max(FLOOR_DB, 20 * Math.log10(Math.max(level, 1e-6)))
const wrap = (value: number, period: number): number => ((value % period) + period) % period

/** Evidence per position in a cycle (beats in a bar, bars in a phrase), each slot decaying on its own as it comes round. */
class Accumulator {
  private readonly values: Float64Array
  private leader = 0
  private challenger = -1
  private challengerRuns = 0

  constructor(readonly size: number) {
    this.values = new Float64Array(size)
  }

  add = (position: number, value: number, decay: number): void => {
    this.values[position] = this.values[position]! * decay + value
  }

  score = (position: number): number => this.values[wrap(position, this.size)]!

  /** The position that leads, kept until another has led for `runs` calls in a row. */
  lead = (scoreOf: (position: number) => number, runs: number): number => {
    let best = 0
    for (let p = 1; p < this.size; p++) if (scoreOf(p) > scoreOf(best)) best = p
    if (best === this.leader) {
      this.challengerRuns = 0
      return this.leader
    }
    this.challengerRuns = best === this.challenger ? this.challengerRuns + 1 : 1
    this.challenger = best
    if (this.challengerRuns >= runs) {
      this.leader = best
      this.challengerRuns = 0
    }
    return this.leader
  }

  confidence = (scoreOf: (at: number) => number, position: number): number => {
    let mean = 0
    for (let p = 0; p < this.size; p++) mean += scoreOf(p) / this.size
    const top = scoreOf(position)
    return top > 0 ? Math.max(0, Math.min(1, (top - mean) / top)) : 0
  }

  shift = (by: number): void => {
    this.leader = wrap(this.leader + by, this.size)
  }
}

export class BeatGrid {
  private readonly options: BeatGridOptions
  private anchor: number | null = null
  private nextBeat = Infinity
  private beatCount = 0
  private jumpRuns = 0
  private nextPhase = 0
  private readonly bins: Float64Array
  // Per frame since the last beat: band levels in dB (for the change across beats and bars) and the clap and kick rises.
  private readonly bandSums = new Float64Array(BANDS)
  private frames = 0
  private readonly lastDb = new Float64Array(BANDS)
  // The last couple of seconds of frames (time, clap rise, kick rise), so each beat's own hits can be read from a window around it.
  private readonly recent: Array<[number, number, number]> = []
  private lastBeatMs: number | null = null
  private readonly followers = new Float64Array(BANDS).fill(FLOOR_DB)
  private readonly beatProfiles: Float64Array[] = []
  private readonly downbeat = new Accumulator(BEATS_PER_BAR)
  private readonly clap = new Accumulator(BEATS_PER_BAR)
  private readonly kick = new Accumulator(BEATS_PER_BAR)
  private readonly phrase = new Accumulator(BARS_PER_PHRASE)
  private downbeatPosition = 0
  private phrasePosition = 0
  private barCount = 0
  private readonly barProfiles: Float64Array[] = []
  private readonly barSum = new Float64Array(BANDS)
  private barBeats = 0
  private state: GridState | null = null

  constructor(private readonly tempo: TempoTracker, options: Partial<BeatGridOptions> = {}) {
    this.options = { ...DEFAULT_GRID_OPTIONS, ...options }
    this.bins = new Float64Array(Math.ceil(this.options.phaseWindowMs / BIN_MS))
  }

  /** Adds one frame (call after the tempo tracker's push for the same frame). Returns true on the frame a beat lands. */
  push = (t: number, levels: readonly number[]): boolean => {
    for (let b = 0; b < BANDS; b++) {
      const db = toDb(levels[b] ?? 0)
      this.bandSums[b]! += db
      this.lastDb[b] = db
    }
    this.frames++
    this.recent.push([t, this.rise(3, levels), this.rise(0, levels)])
    if (this.recent.length > 0 && this.recent[0]![0] < t - RECENT_MS) this.recent.splice(0, this.recent.findIndex(([time]) => time >= t - RECENT_MS / 2))
    const period = this.tempo.getPeriodMs()
    if (period === null) {
      this.anchor = null
      this.state = null
      return false
    }
    if (t >= this.nextPhase) {
      this.nextPhase = t + this.options.phaseEveryMs
      this.updatePhase(t, period)
    }
    if (this.anchor === null || t < this.nextBeat) return false
    this.onBeat(this.nextBeat, period)
    this.nextBeat = this.scheduleNext(period, t)
    return true
  }

  // The next beat on the clock after the last one that fired (at least half a beat after it, so a correction never fires one twice), or
  // after now when none has. Scheduled from the last fired beat, not from now, so a correction on the frame a beat is due cannot skip it.
  private scheduleNext = (period: number, t: number): number => {
    const anchor = this.anchor!
    const after = this.lastBeatMs === null ? t : this.lastBeatMs + period / 2
    return anchor + Math.ceil((after - anchor) / period + 1e-9) * period
  }

  getState = (): GridState | null => this.state

  // How far a band rose on this frame over its own last 30 ms (the same kind of rise the tempo tracker reads).
  private rise = (band: number, levels: readonly number[]): number => {
    const db = toDb(levels[band] ?? 0)
    const follower = this.followers[band]!
    const rise = Math.max(0, db - follower)
    this.followers[band] = follower + (db - follower) * 0.4
    return rise
  }

  // Scores every phase of the period against the recent onsets and moves the clock toward the best one.
  private updatePhase = (t: number, period: number): void => {
    const { times, strength } = this.tempo.getOnsets()
    const n = this.bins.length
    const start = t - n * BIN_MS
    this.bins.fill(0)
    for (let k = 1; k < times.length; k++) {
      const bin = Math.floor((times[k]! - start) / BIN_MS)
      if (bin >= 0 && bin < n) this.bins[bin]! += strength[k]!
    }
    // A light box smoothing, so an onset a few ms off the grid still counts.
    let running = 0
    const smoothed = new Float64Array(n)
    for (let i = 0; i < n; i++) {
      running += this.bins[i]! - (i >= SMOOTH_BINS ? this.bins[i - SMOOTH_BINS]! : 0)
      smoothed[i] = running
    }
    const periodBins = period / BIN_MS
    // The newest bins are left out: a beat's onset is still arriving there.
    const newest = n - 1 - GUARD_BINS
    let bestAt = newest
    let bestScore = -1
    for (let first = newest; first > newest - periodBins; first--) {
      let score = 0
      for (let at = first; at >= 0; at -= periodBins) score += smoothed[Math.round(at)] ?? 0
      if (score > bestScore) {
        bestScore = score
        bestAt = first
      }
    }
    // The bin's middle, less the half box the causal smoothing delays a peak by, less the band filters' and level windows' own lag.
    const measured = start + (bestAt + 0.5) * BIN_MS - ((SMOOTH_BINS - 1) / 2) * BIN_MS - this.options.latencyMs
    if (this.anchor === null) {
      this.anchor = measured
      this.nextBeat = this.scheduleNext(period, t)
      return
    }
    const error = wrap(measured - this.anchor + period / 2, period) - period / 2
    if (Math.abs(error) <= period * this.options.phaseJump) {
      this.anchor += error * this.options.phaseFollow
      this.jumpRuns = 0
    } else if (++this.jumpRuns >= this.options.phaseJumpUpdates) {
      this.anchor += error
      this.jumpRuns = 0
    }
    this.nextBeat = this.scheduleNext(period, t)
  }

  // A beat lands: the evidence for the beat just finished, then the downbeat and phrase decisions.
  private onBeat = (beatMs: number, period: number): void => {
    const { downbeatMemoryBars, phraseMemoryBars, clapWeight, changeWeight, kickWeight, switchBars } = this.options
    const profile = Float64Array.from(this.bandSums, (sum) => sum / Math.max(this.frames, 1))
    this.bandSums.fill(0)
    this.frames = 0
    // If the clock moved by whole beats (a re-anchor), the beats in between still happened: count them, so the place in the bar stays put.
    if (this.lastBeatMs !== null) this.beatCount += Math.max(0, Math.round((beatMs - this.lastBeatMs) / period) - 1)
    const position = this.beatCount % BEATS_PER_BAR
    const decay = Math.exp(-1 / downbeatMemoryBars)
    // The clap and kick of the beat before this one, from a window around it (a quarter beat before to half a beat after), now all past.
    const ended = wrap(position - 1, BEATS_PER_BAR)
    if (this.lastBeatMs !== null) {
      let clap = 0
      let kick = 0
      for (const [time, clapRise, kickRise] of this.recent) {
        if (time < this.lastBeatMs - period / 4 || time > this.lastBeatMs + period / 2) continue
        clap = Math.max(clap, clapRise)
        kick = Math.max(kick, kickRise)
      }
      this.clap.add(ended, clap, decay)
      this.kick.add(ended, kick, decay)
    }
    this.lastBeatMs = beatMs
    // How much the sound changed across the beat before last: the interval after it against the interval before it.
    this.beatProfiles.push(profile)
    if (this.beatProfiles.length > 2) this.beatProfiles.shift()
    if (this.beatProfiles.length === 2) {
      const [before, after] = this.beatProfiles as [Float64Array, Float64Array]
      let change = 0
      for (let b = 0; b < BANDS; b++) change += Math.abs(after[b]! - before[b]!)
      this.downbeat.add(ended, change, decay)
    }
    this.beatCount++
    const clapMean = (this.clap.score(0) + this.clap.score(1) + this.clap.score(2) + this.clap.score(3)) / 4 || 1
    const changeMean = (this.downbeat.score(0) + this.downbeat.score(1) + this.downbeat.score(2) + this.downbeat.score(3)) / 4 || 1
    const kickMean = (this.kick.score(0) + this.kick.score(1) + this.kick.score(2) + this.kick.score(3)) / 4 || 1
    const scoreOf = (d: number): number =>
      changeWeight * (this.downbeat.score(d) / changeMean) +
      clapWeight * ((this.clap.score(d + 1) + this.clap.score(d + 3) - this.clap.score(d) - this.clap.score(d + 2)) / clapMean) +
      kickWeight * (this.kick.score(d) / kickMean)
    // Decided once a bar, on its last beat, so a change of mind moves the bar line, not a beat in the middle of it.
    if (position === BEATS_PER_BAR - 1) this.downbeatPosition = this.downbeat.lead(scoreOf, switchBars)
    const beatInBar = wrap(this.beatCount - 1 - this.downbeatPosition, BEATS_PER_BAR) + 1
    // The beat that just ended belongs to the bar now closing; a new bar starts on beat 1.
    for (let b = 0; b < BANDS; b++) this.barSum[b]! += profile[b]!
    this.barBeats++
    if (beatInBar === 1) {
      const bar = Float64Array.from(this.barSum, (sum) => sum / Math.max(this.barBeats, 1))
      this.barSum.fill(0)
      this.barBeats = 0
      this.onBar(bar, Math.exp(-1 / phraseMemoryBars), switchBars)
    }
    const barInPhrase = wrap(this.barCount - 1 - this.phrasePosition, BARS_PER_PHRASE) + 1
    this.state = {
      beat: this.beatCount,
      beatInBar,
      barInPhrase,
      periodMs: period,
      lastBeatMs: beatMs,
      nextBeatMs: beatMs + period,
      downbeatConfidence: this.downbeat.confidence(scoreOf, this.downbeatPosition),
      phraseConfidence: this.phrase.confidence((p) => this.phrase.score(p), this.phrasePosition),
    }
  }

  // A bar line: how much the bar just finished differs from the one before, as evidence for where the phrase lines are.
  private onBar = (bar: Float64Array, decay: number, switchBars: number): void => {
    this.barProfiles.push(bar)
    if (this.barProfiles.length > 2) this.barProfiles.shift()
    const position = this.barCount % BARS_PER_PHRASE
    if (this.barProfiles.length === 2) {
      const [before, after] = this.barProfiles as [Float64Array, Float64Array]
      let change = 0
      for (let b = 0; b < BANDS; b++) change += Math.abs(after[b]! - before[b]!)
      // The change is across the bar line that started the bar now ending (one bar back).
      this.phrase.add(wrap(position - 1, BARS_PER_PHRASE), change, decay)
    }
    this.barCount++
    this.phrasePosition = this.phrase.lead((p) => this.phrase.score(p), switchBars)
  }
}
