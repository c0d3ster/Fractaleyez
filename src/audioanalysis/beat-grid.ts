/* eslint-disable max-classes-per-file */
// Where the beats, bars and phrases fall, causally, on top of the tempo tracker: the grid EDM is built on.
//
// Raveform's 1,423 annotated EDM tracks (see docs/implementation-plans/bar-grid.md) are all in 4/4, every section starts on a downbeat,
// 73% of them on an 8-bar line, and 83 to 93% of sections last a multiple of 8 bars. So knowing beat 1 and the 8-bar line says when a
// drop or a breakdown can start, which is what the section tracker is missing.
//
//  1. Beat clock. The tempo tracker gives the period. Every 250 ms the last 8 s of onset strength (on a 5 ms grid, lightly smoothed) is
//     scored against every phase of that period (the onset strength is the beat network's beat probability when the grid has one: it knows
//     a beat from an off-beat hat, which the tempo tracker's band rises do not; the tempo itself stays on the band rises, which read
//     periods better); the clock is nudged toward the best one (a small error) or re-anchored on it (a large one
//     that persists). A beat event fires on the frame the clock passes a beat.
//  2. Downbeat. Once a beat is two beats past: how far each band rose on it (kick, clap, crash) and how much each band's level changed
//     across it, over one beat and over two (bar lines change most: a new bass note, a new loop). Kept per position in the bar with a slow
//     decay. Each hypothesis "this position is beat 1" weighs every position's cues by where it sits relative to that beat (claps count for
//     beats 2 and 4, changes for beat 1), with weights fitted on Raveform's marked beats (scripts/section-eval/grid-train.py); the downbeat
//     is the hypothesis that wins, and it moves only after winning for a while.
//  3. Phrase. The same at bar level, four bars after each bar line: the rise on its first beat and how much the level changed across it
//     over one, two and four bars, kept per position in an 8-bar cycle and weighed per hypothesis with fitted weights.
import model from './beat-grid-model.json'
import beatNetModel from './beat-net-model.json'
import { TempoTracker, tempoTracker } from './tempo-tracker'
import { BeatActivation, BeatNet, BeatNetModel } from './beat-net'

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
  /** A jump to near the off-beat (an error over this share of a beat) waits offbeatJumpScale times as long: hi-hats pull the clock there. */
  offbeatJump: number
  offbeatJumpScale: number
  /** Memory of the downbeat and phrase evidence, in bars. */
  downbeatMemoryBars: number
  phraseMemoryBars: number
  /** A different downbeat takes over once it has led for this many bars; a different phrase line, for phraseSwitchBars. */
  switchBars: number
  phraseSwitchBars: number
  /** How late the onsets arrive after the sound that makes them (band filters and level windows), taken off the beat times. Left out, it
   * is LATENCY_MS, or BEAT_NET_LATENCY_MS when the tempo tracker reads the beat network (which fires closer to the sound). */
  latencyMs: number
}

export const DEFAULT_GRID_OPTIONS: BeatGridOptions = {
  phaseWindowMs: 8000,
  phaseEveryMs: 250,
  phaseFollow: 0.4,
  phaseJump: 0.2,
  phaseJumpUpdates: 24,
  offbeatJump: 0.4,
  offbeatJumpScale: 3,
  downbeatMemoryBars: 24,
  phraseMemoryBars: 24,
  switchBars: 2,
  phraseSwitchBars: 2,
  latencyMs: 25,
}

// Measured on Raveform's held-out folds: the beat network's beats land 21 ms earlier than the band rises', so 4 ms puts them on the marks.
const BEAT_NET_LATENCY_MS = 4

const BANDS = 5
const BIN_MS = 5
const SMOOTH_BINS = 4
const GUARD_BINS = 12
const RECENT_MS = 2000
const BEATS_PER_BAR = 4
const BARS_PER_PHRASE = 8
const FLOOR_DB = -60

// The fitted weights: per hypothesis slot (the position d + r for hypothesis d), per cue. Beat cues: rise, 1-beat change, 2-beat change,
// each per band. Bar cues: rise on the first beat, 1-, 2- and 4-bar change, each per band.
const DOWNBEAT_WEIGHTS: readonly (readonly number[])[] = model.downbeat
const PHRASE_WEIGHTS: readonly (readonly number[])[] = model.phrase
const BEAT_CUES = BANDS * 3
const BAR_CUES = BANDS * 4

const toDb = (level: number): number => Math.max(FLOOR_DB, 20 * Math.log10(Math.max(level, 1e-6)))
const wrap = (value: number, period: number): number => ((value % period) + period) % period

/**
 * Cues per position in a cycle (beats in a bar, bars in a phrase), each position decaying on its own as it comes round, and which
 * position the fitted weights say is the line.
 */
class Accumulator {
  private readonly values: Float64Array[]
  private readonly scores: Float64Array
  private leader = 0
  private challenger = -1
  private challengerRuns = 0

  constructor(readonly size: number, private readonly cues: number, private readonly weights: readonly (readonly number[])[]) {
    this.values = Array.from({ length: size }, () => new Float64Array(cues))
    this.scores = new Float64Array(size)
  }

  add = (position: number, cues: ArrayLike<number>, decay: number): void => {
    const values = this.values[wrap(position, this.size)]!
    for (let c = 0; c < this.cues; c++) values[c] = values[c]! * decay + cues[c]!
  }

  // Each hypothesis d ("position d is the line") from every position's cues, each cue taken relative to its mean over the positions.
  private score = (): void => {
    this.scores.fill(0)
    for (let c = 0; c < this.cues; c++) {
      let mean = 0
      for (let p = 0; p < this.size; p++) mean += this.values[p]![c]! / this.size
      if (mean <= 1e-6) continue
      for (let d = 0; d < this.size; d++) {
        for (let r = 0; r < this.size; r++) this.scores[d]! += this.weights[r]![c]! * (this.values[(d + r) % this.size]![c]! / mean)
      }
    }
  }

  /** The position that leads, kept until another has led for `runs` calls in a row. */
  lead = (runs: number): number => {
    this.score()
    let best = 0
    for (let p = 1; p < this.size; p++) if (this.scores[p]! > this.scores[best]!) best = p
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

  /** How far the leader's share of the evidence (a softmax over the hypotheses) is above chance, 0 to 1. */
  confidence = (): number => {
    let top = -Infinity
    for (let p = 0; p < this.size; p++) top = Math.max(top, this.scores[p]!)
    let sum = 0
    for (let p = 0; p < this.size; p++) sum += Math.exp(this.scores[p]! - top)
    const share = Math.exp(this.scores[this.leader]! - top) / sum
    return Math.max(0, Math.min(1, (share - 1 / this.size) / (1 - 1 / this.size)))
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
  // The last couple of seconds of frames (time, then each band's rise), so each beat's own hits can be read from a window around it.
  private readonly recent: Float64Array[] = []
  private lastBeatMs: number | null = null
  private readonly followers = new Float64Array(BANDS).fill(FLOOR_DB)
  // The last four beats' level profiles and the last two beats' rises, oldest first, for the cues of the beat two back.
  private readonly beatProfiles: Float64Array[] = []
  private readonly beatRises: Float64Array[] = []
  private readonly beatCues = new Float64Array(BEAT_CUES)
  private readonly downbeat = new Accumulator(BEATS_PER_BAR, BEAT_CUES, DOWNBEAT_WEIGHTS)
  private readonly phrase = new Accumulator(BARS_PER_PHRASE, BAR_CUES, PHRASE_WEIGHTS)
  private downbeatPosition = 0
  private phrasePosition = 0
  private barCount = 0
  private lastBeatInBar = 0
  private barStartRise = new Float64Array(BANDS)
  // The last eight bars' level profiles and the rises on their first beats, oldest first, for the cues of the bar line four back.
  private readonly barProfiles: Float64Array[] = []
  private readonly barRises: Float64Array[] = []
  private readonly barCues = new Float64Array(BAR_CUES)
  private readonly barSum = new Float64Array(BANDS)
  private barBeats = 0
  private state: GridState | null = null
  private readonly net: BeatNet | null
  // The beat network's hops of the last phase window (time, beat probability), when the grid runs one.
  private readonly netTimes: number[] = []
  private readonly netBeat: number[] = []
  private lastActivation: BeatActivation | null = null

  constructor(private readonly tempo: TempoTracker, options: Partial<BeatGridOptions> = {}, beatNet: BeatNetModel | null = null) {
    const usesNet = beatNet !== null || tempo.hasBeatNet()
    this.options = { ...DEFAULT_GRID_OPTIONS, ...(usesNet ? { latencyMs: BEAT_NET_LATENCY_MS } : {}), ...options }
    this.bins = new Float64Array(Math.ceil(this.options.phaseWindowMs / BIN_MS))
    this.net = beatNet ? new BeatNet(beatNet, this.addActivation) : null
  }

  private addActivation = (activation: BeatActivation): void => {
    this.lastActivation = activation
    this.netTimes.push(activation.t)
    this.netBeat.push(activation.beat)
    if (this.netTimes[0]! < activation.t - this.options.phaseWindowMs - 2000) {
      const keep = this.netTimes.findIndex((time) => time >= activation.t - this.options.phaseWindowMs - 1000)
      this.netTimes.splice(0, keep)
      this.netBeat.splice(0, keep)
    }
  }

  /** The beat network's last hop (null without one): how likely a beat and a downbeat are right now. */
  getActivation = (): BeatActivation | null => this.lastActivation ?? this.tempo.getActivation()

  /** Adds one frame (call after the tempo tracker's push for the same frame). Returns true on the frame a beat lands. */
  push = (t: number, levels: readonly number[]): boolean => {
    this.net?.push(t, levels)
    for (let b = 0; b < BANDS; b++) {
      const db = toDb(levels[b] ?? 0)
      this.bandSums[b]! += db
      this.lastDb[b] = db
    }
    this.frames++
    const frame = new Float64Array(BANDS + 1)
    frame[0] = t
    for (let b = 0; b < BANDS; b++) frame[b + 1] = this.rise(b, levels)
    this.recent.push(frame)
    if (this.recent[0]![0]! < t - RECENT_MS) this.recent.splice(0, this.recent.findIndex((f) => f[0]! >= t - RECENT_MS / 2))
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
    const { times, strength } = this.net ? { times: this.netTimes, strength: this.netBeat } : this.tempo.getOnsets()
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
    } else if (++this.jumpRuns >= this.options.phaseJumpUpdates * (Math.abs(error) > period * this.options.offbeatJump ? this.options.offbeatJumpScale : 1)) {
      this.anchor += error
      this.jumpRuns = 0
    }
    this.nextBeat = this.scheduleNext(period, t)
  }

  // A beat lands: the cues for the beat two back (now that the two beats after it are known), then the downbeat and phrase decisions.
  private onBeat = (beatMs: number, period: number): void => {
    const { downbeatMemoryBars, phraseMemoryBars, switchBars, phraseSwitchBars } = this.options
    const profile = Float64Array.from(this.bandSums, (sum) => sum / Math.max(this.frames, 1))
    this.bandSums.fill(0)
    this.frames = 0
    // If the clock moved by whole beats (a re-anchor), the beats in between still happened: count them, so the place in the bar stays put.
    if (this.lastBeatMs !== null) this.beatCount += Math.max(0, Math.round((beatMs - this.lastBeatMs) / period) - 1)
    const position = this.beatCount % BEATS_PER_BAR
    // The hits of the beat before this one, from a window around it (a quarter beat before to half a beat after), now all past.
    if (this.lastBeatMs !== null) {
      const rise = new Float64Array(BANDS)
      for (const frame of this.recent) {
        const time = frame[0]!
        if (time < this.lastBeatMs - period / 4 || time > this.lastBeatMs + period / 2) continue
        for (let b = 0; b < BANDS; b++) rise[b] = Math.max(rise[b]!, frame[b + 1]!)
      }
      this.beatRises.push(rise)
      if (this.beatRises.length > 2) this.beatRises.shift()
      if (this.lastBeatInBar === 1) this.barStartRise = rise
    }
    this.lastBeatMs = beatMs
    // The profile is the interval that just ended, from the beat before to this one. With four of them, the beat two back has an interval
    // on each side for the 1-beat change and two on each side for the 2-beat change.
    this.beatProfiles.push(profile)
    if (this.beatProfiles.length > 4) this.beatProfiles.shift()
    if (this.beatProfiles.length === 4 && this.beatRises.length === 2) {
      const [i0, i1, i2, i3] = this.beatProfiles as [Float64Array, Float64Array, Float64Array, Float64Array]
      const rise = this.beatRises[0]!
      for (let b = 0; b < BANDS; b++) {
        this.beatCues[b] = rise[b]!
        this.beatCues[BANDS + b] = Math.abs(i2[b]! - i1[b]!)
        this.beatCues[2 * BANDS + b] = Math.abs((i2[b]! + i3[b]!) / 2 - (i0[b]! + i1[b]!) / 2)
      }
      this.downbeat.add(position - 2, this.beatCues, Math.exp(-1 / downbeatMemoryBars))
    }
    this.beatCount++
    // Decided once a bar, on its last beat, so a change of mind moves the bar line, not a beat in the middle of it.
    if (position === BEATS_PER_BAR - 1) this.downbeatPosition = this.downbeat.lead(switchBars)
    const beatInBar = wrap(this.beatCount - 1 - this.downbeatPosition, BEATS_PER_BAR) + 1
    this.lastBeatInBar = beatInBar
    // The beat that just ended belongs to the bar now closing; a new bar starts on beat 1.
    for (let b = 0; b < BANDS; b++) this.barSum[b]! += profile[b]!
    this.barBeats++
    if (beatInBar === 1) {
      const bar = Float64Array.from(this.barSum, (sum) => sum / Math.max(this.barBeats, 1))
      this.barSum.fill(0)
      this.barBeats = 0
      this.onBar(bar, Math.exp(-1 / phraseMemoryBars), phraseSwitchBars)
    }
    const barInPhrase = wrap(this.barCount - 1 - this.phrasePosition, BARS_PER_PHRASE) + 1
    this.state = {
      beat: this.beatCount,
      beatInBar,
      barInPhrase,
      periodMs: period,
      lastBeatMs: beatMs,
      nextBeatMs: beatMs + period,
      downbeatConfidence: this.downbeat.confidence(),
      phraseConfidence: this.phrase.confidence(),
    }
  }

  // A bar line: the bar that just finished, and with eight of them the cues of the bar line four back (four bars on each side of it).
  private onBar = (bar: Float64Array, decay: number, switchBars: number): void => {
    this.barProfiles.push(bar)
    this.barRises.push(this.barStartRise)
    if (this.barProfiles.length > 8) {
      this.barProfiles.shift()
      this.barRises.shift()
    }
    if (this.barProfiles.length === 8) {
      const bars = this.barProfiles
      const rise = this.barRises[4]!
      const mean = (from: number, to: number, b: number): number => {
        let sum = 0
        for (let i = from; i < to; i++) sum += bars[i]![b]!
        return sum / (to - from)
      }
      for (let b = 0; b < BANDS; b++) {
        this.barCues[b] = rise[b]!
        this.barCues[BANDS + b] = Math.abs(bars[4]![b]! - bars[3]![b]!)
        this.barCues[2 * BANDS + b] = Math.abs(mean(4, 6, b) - mean(2, 4, b))
        this.barCues[3 * BANDS + b] = Math.abs(mean(4, 8, b) - mean(0, 4, b))
      }
      // The bar just finished started at line barCount - 1; the one four back at barCount - 4.
      this.phrase.add(this.barCount - 4, this.barCues, decay)
    }
    this.barCount++
    this.phrasePosition = this.phrase.lead(switchBars)
  }
}

/** The app's grid, on the app's tempo tracker, with the beat network for its phase. AudioFeed pushes it each frame, right after the tracker. */
export const beatGrid = new BeatGrid(tempoTracker, {}, beatNetModel)
