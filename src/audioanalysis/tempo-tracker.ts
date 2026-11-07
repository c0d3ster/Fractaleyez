// A steady tempo from the onset bands, fed every frame. Replaces reading a tempo afresh from the last 12 s of detected beats, which jumps
// around (a steady 128 BPM track read 96, 127, 160 and 176): those beats are sparse (at most one per 250 ms), come from two bands only and
// carry no memory from one reading to the next.
//
//  1. Onset strength: every frame, how much each band rose in dB over its own level of the last few tens of ms (times the frame's length),
//     each band scaled by its own running average rise
//     so a band that is empty on this input (the bass on laptop speakers) neither dominates nor vanishes. Kept with its time.
//  2. Every half second, the last 12 s of it on an even 10 ms grid, and its autocorrelation over beat periods from 60 to 200 BPM. A
//     period scores its own correlation, plus some of two and four of it (a real beat also lines up on its bars) and of half of it (a real
//     beat is subdivided; the beat and a half of a two-step kick is not), times a prior around the tempos dance music is counted at,
//     which settles 128 against 64 and 174 against 87 or 116.
//  3. The scores of each reading are blended into a running score with a memory of several seconds, and the shown tempo only moves to a
//     different peak once that peak has clearly won for a few readings in a row. Small drifts on the same peak are followed smoothly.
//     Through a stretch with no rhythm (a breakdown) the last tempo is held; after a long one it is dropped.

export type TempoTrackerOptions = {
  /** Each band's onset is its rise over a follower of its level with this time constant. */
  onsetTauMs: number
  /** How much onset strength each reading looks at. */
  windowMs: number
  /** How often a reading is made. */
  readEveryMs: number
  /** How long the running score remembers (exponential). */
  memoryMs: number
  /** The prior: a log-normal bump around this tempo, this many octaves wide. */
  priorBpm: number
  priorOctaves: number
  /** How much each band (bass, lo, mid, hi, air) counts in the onset strength. In dance music the kick sets the beat; hats are where dotted and shuffled patterns live. */
  bandWeights: readonly number[]
  /** Weights of 2, 3 and 4 periods in a period's score. */
  harmonics: readonly number[]
  /** Weight of half the period (a real beat is usually subdivided: hats on the eighths). A period of a beat and a half, which a two-step kick makes, is not. */
  subdivision: number
  /** A different peak has to beat the shown one by this ratio, for this many readings in a row, to take over. */
  switchRatio: number
  switchReadings: number
  /** Within this share of the shown tempo, a new reading is the same tempo drifting, and it is followed this fast (0 to 1 per reading). */
  sameTempo: number
  follow: number
  /** Under this peak sharpness, or this periodicity strength (the best period's running score), there is no rhythm to read; the tempo is
   * held for this long, then dropped. Noise (white, pink, brown, a fan) never scored over 0.53; music sits around 1. */
  minConfidence: number
  minStrength: number
  holdMs: number
}

// Tuned on 116 GiantSteps excerpts (scripts/section-eval/bpm-eval.mts) and checked on the other 546, clean and through a laptop mic; the
// bass weight was then set by 2-fold cross-validation over all 661 (both halves chose 2, and each gained about 2 points on the other).
export const DEFAULT_TEMPO_OPTIONS: TempoTrackerOptions = {
  onsetTauMs: 20,
  windowMs: 12000,
  readEveryMs: 500,
  memoryMs: 8000,
  priorBpm: 145,
  priorOctaves: 0.5,
  bandWeights: [2, 1, 0.5, 0.5, 0.25],
  // Two and four beats, not three: crediting three made dotted patterns (three quarters of a beat) win. Four at 0.75 (BPM loop, stage 4).
  harmonics: [0.5, 0, 0.75],
  subdivision: 1.5,
  switchRatio: 1.15,
  switchReadings: 4,
  sameTempo: 0.03,
  follow: 0.3,
  minConfidence: 0.08,
  minStrength: 0.6,
  holdMs: 30000,
}

const BANDS = 5
const GRID_MS = 10
const MIN_BPM = 60
const MAX_BPM = 200
const MIN_LAG = Math.floor(60000 / MAX_BPM / GRID_MS)
const MAX_LAG = Math.ceil(60000 / MIN_BPM / GRID_MS)
const BAND_NORM_TAU_MS = 4000
const FLOOR_DB = -60
const TRIM_SLACK_MS = 1000
const HARMONIC_LIMIT = 4
const FIRST_LOCK_READINGS = 6
const FIRST_LOCK_STRENGTH = 0.7

const toDb = (level: number): number => Math.max(FLOOR_DB, 20 * Math.log10(Math.max(level, 1e-6)))

export type TempoReading = {
  bpm: number
  /** How clearly the beat stands out (the shown peak's score over the mean score), 0 to about 1. */
  confidence: number
  /** How periodic the onsets are at all: the running score of the best period (a correlation, 0 for noise, rising with a steady beat). */
  strength: number
}

export class TempoTracker {
  private readonly options: TempoTrackerOptions
  private readonly times: number[] = []
  private readonly strength: number[] = []
  private readonly lastDb = new Float64Array(BANDS)
  private readonly bandMean = new Float64Array(BANDS).fill(1)
  private lastT: number | null = null
  private startT = 0
  private nextRead = 0
  private readonly running = new Float64Array(MAX_LAG + 1)
  private runningReady = false
  private readonly prior = new Float64Array(MAX_LAG + 1)
  private shownLag: number | null = null
  private challengerLag: number | null = null
  private challengerReadings = 0
  private lastRhythm = -Infinity
  private rhythmReadings = 0
  private reading: TempoReading | null = null
  private readonly grid: Float64Array
  private readonly acf = new Float64Array(MAX_LAG * HARMONIC_LIMIT + 1)

  constructor(options: Partial<TempoTrackerOptions> = {}) {
    this.options = { ...DEFAULT_TEMPO_OPTIONS, ...options }
    if (this.options.harmonics.length > HARMONIC_LIMIT - 1) throw new Error(`tempo tracker: at most ${HARMONIC_LIMIT - 1} harmonics`)
    this.grid = new Float64Array(Math.ceil(this.options.windowMs / GRID_MS))
    const { priorBpm, priorOctaves } = this.options
    for (let lag = MIN_LAG; lag <= MAX_LAG; lag++) {
      const octaves = Math.log2(60000 / (lag * GRID_MS) / priorBpm)
      this.prior[lag] = Math.exp(-0.5 * (octaves / priorOctaves) ** 2)
    }
  }

  /** Adds one frame: the five onset-band levels (% of full scale). The beat flag is not used; the tracker reads the levels itself. */
  push = (t: number, levels: readonly number[], _beat?: boolean): void => {
    const dt = this.lastT === null ? 0 : Math.max(1, t - this.lastT)
    // Each band's rise over its own recent level (a follower of `onsetTauMs`), weighted by how long the frame lasted: an integral over time,
    // so the same at any frame rate. Rises from one frame to the next would count every jitter as an onset, more of them the faster the frames.
    const follow = 1 - Math.exp(-dt / this.options.onsetTauMs)
    let onset = 0
    for (let b = 0; b < BANDS; b++) {
      const db = toDb(levels[b] ?? 0)
      if (this.lastT === null) {
        this.lastDb[b] = db
        this.startT = t
        continue
      }
      const rise = Math.max(0, db - this.lastDb[b]!)
      this.lastDb[b]! += (db - this.lastDb[b]!) * follow
      // A running average from the first frame (not from a made-up starting value), turning into the 4 s exponential one once that much has passed.
      this.bandMean[b]! += (rise - this.bandMean[b]!) * Math.max(1 - Math.exp(-dt / BAND_NORM_TAU_MS), dt / Math.max(dt, t - this.startT))
      onset += (((this.options.bandWeights[b] ?? 1) * rise) / Math.max(this.bandMean[b]!, 0.05)) * (dt / GRID_MS)
    }
    this.lastT = t
    this.times.push(t)
    this.strength.push(onset)
    // Trimmed in batches, so a frame is not an array shift.
    if (this.times.length > 0 && this.times[0]! < t - this.options.windowMs - TRIM_SLACK_MS * 2) {
      const keep = this.times.findIndex((time) => time >= t - this.options.windowMs - TRIM_SLACK_MS)
      this.times.splice(0, keep)
      this.strength.splice(0, keep)
    }
    if (t >= this.nextRead) {
      this.nextRead = t + this.options.readEveryMs
      this.read(t)
    }
  }

  /** The tempo to show, or null when there is none (not enough rhythm yet, or none for a long while). */
  getBpm = (): number | null => this.reading?.bpm ?? null

  getReading = (): TempoReading | null => this.reading

  /** The beat period in ms the shown tempo stands for, or null. */
  getPeriodMs = (): number | null => (this.reading ? 60000 / this.reading.bpm : null)

  /** The onset strength of recent frames (when each frame was, and its strength), oldest first. Not copies: read them where they are called. */
  getOnsets = (): { times: readonly number[]; strength: readonly number[] } => ({ times: this.times, strength: this.strength })

  private read = (t: number): void => {
    const { windowMs, memoryMs, readEveryMs, harmonics } = this.options
    if (this.times.length < 2 || t - this.times[0]! < windowMs * 0.75) return
    // The onset strength on an even grid: each frame's rise spread evenly over the time that frame covers (since the frame before), so the
    // total is the same at any frame rate and the frame clock itself leaves no comb in it. (Sampling one value per bin drops most frames at
    // 144 fps; putting each frame's rise in one bin makes spikes on the frame clock that the autocorrelation then locks onto.)
    const n = this.grid.length
    const start = t - n * GRID_MS
    this.grid.fill(0)
    for (let k = 1; k < this.times.length; k++) {
      const from = Math.max(this.times[k - 1]!, start)
      const to = this.times[k]!
      if (to <= from) continue
      const density = this.strength[k]! / (to - this.times[k - 1]!)
      for (let bin = Math.floor((from - start) / GRID_MS); bin < n && start + bin * GRID_MS < to; bin++) {
        const overlap = Math.min(to, start + (bin + 1) * GRID_MS) - Math.max(from, start + bin * GRID_MS)
        if (bin >= 0 && overlap > 0) this.grid[bin]! += density * overlap
      }
    }
    // Until the window has filled (the first 12 s), only the part that has audio counts: empty bins would dilute the correlation.
    const first = Math.max(0, Math.ceil((this.times[0]! - start) / GRID_MS))
    const filled = n - first
    let mean = 0
    for (let i = first; i < n; i++) mean += this.grid[i]! / filled
    for (let i = first; i < n; i++) this.grid[i]! -= mean
    // Autocorrelation over every lag up to four beats of the slowest tempo, normalised by the zero lag.
    const maxLag = Math.min(filled - 1, MAX_LAG * (harmonics.length + 1))
    const acf = this.acf
    acf.fill(0)
    for (let lag = 0; lag <= maxLag; lag++) {
      let sum = 0
      for (let i = first + lag; i < n; i++) sum += this.grid[i]! * this.grid[i - lag]!
      acf[lag] = sum / (filled - lag)
    }
    // No onsets at all in the window (silence, or a pad with nothing moving): this reading is no evidence of a rhythm, whatever the running score says.
    const hasOnsets = acf[0]! > 1e-9
    const zero = acf[0]! || 1
    const alpha = this.runningReady ? 1 - Math.exp(-readEveryMs / memoryMs) : 1
    let total = 0
    for (let lag = MIN_LAG; lag <= MAX_LAG; lag++) {
      let score = Math.max(0, acf[lag]! / zero)
      harmonics.forEach((weight, h) => {
        const at = lag * (h + 2)
        if (at <= maxLag) score += weight * Math.max(0, acf[at]! / zero)
      })
      if (this.options.subdivision > 0) score += this.options.subdivision * Math.max(0, acf[Math.round(lag / 2)]! / zero)
      this.running[lag]! += (score - this.running[lag]!) * alpha
      total += this.running[lag]!
    }
    this.runningReady = true
    this.decide(t, total / (MAX_LAG - MIN_LAG + 1), hasOnsets)
  }

  // The weighted peak of the running score, the hysteresis against the shown one, and the hold through a stretch with no rhythm.
  private decide = (t: number, meanScore: number, hasOnsets: boolean): void => {
    const { switchRatio, switchReadings, sameTempo, follow, minConfidence, minStrength, holdMs } = this.options
    const weighted = (lag: number): number => this.running[lag]! * this.prior[lag]!
    let best = MIN_LAG
    for (let lag = MIN_LAG + 1; lag <= MAX_LAG; lag++) if (weighted(lag) > weighted(best)) best = lag
    const confidence = meanScore > 0 ? Math.min(1, (this.running[best]! - meanScore) / (this.running[best]! + 1e-9)) : 0
    if (!hasOnsets || confidence < minConfidence || this.running[best]! < minStrength) {
      this.rhythmReadings = 0
      if (t - this.lastRhythm > holdMs) {
        this.reading = null
        this.shownLag = null
      }
      return
    }
    // A first tempo needs a stronger rhythm (FIRST_LOCK_STRENGTH), held for a few readings in a row: noise can look periodic for a moment early
    // on, while only a few seconds have been heard, and the hold would then keep it up.
    this.rhythmReadings = this.reading === null && this.running[best]! < FIRST_LOCK_STRENGTH ? 0 : this.rhythmReadings + 1
    if (this.reading === null && this.rhythmReadings < FIRST_LOCK_READINGS) return
    this.lastRhythm = t
    const bpmOf = (lag: number): number => 60000 / (this.refine(lag) * GRID_MS)
    if (this.shownLag === null || this.reading === null) {
      this.shownLag = best
      this.reading = { bpm: bpmOf(best), confidence, strength: this.running[best]! }
      return
    }
    const shownBpm = this.reading.bpm
    const bestBpm = bpmOf(best)
    if (Math.abs(bestBpm - shownBpm) <= shownBpm * sameTempo) {
      // The same tempo, drifting a little or refined: follow it smoothly.
      this.shownLag = best
      this.challengerReadings = 0
      this.reading = { bpm: shownBpm + (bestBpm - shownBpm) * follow, confidence, strength: this.running[best]! }
      return
    }
    const strongEnough = weighted(best) >= weighted(this.shownLag) * switchRatio
    this.challengerReadings = strongEnough && this.challengerLag !== null && Math.abs(this.challengerLag - best) <= 1 ? this.challengerReadings + 1 : strongEnough ? 1 : 0
    this.challengerLag = best
    if (this.challengerReadings >= switchReadings) {
      this.shownLag = best
      this.challengerReadings = 0
      this.reading = { bpm: bestBpm, confidence, strength: this.running[best]! }
    } else {
      this.reading = { bpm: shownBpm, confidence, strength: this.running[best]! }
    }
  }

  // The peak's lag to a fraction of a grid step, from a parabola through it and its neighbours.
  private refine = (lag: number): number => {
    const a = this.running[lag - 1] ?? 0
    const b = this.running[lag]!
    const c = this.running[lag + 1] ?? 0
    const denominator = a - 2 * b + c
    if (lag <= MIN_LAG || lag >= MAX_LAG || denominator >= 0) return lag
    return lag + Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / denominator))
  }
}

export const tempoTracker = new TempoTracker()
