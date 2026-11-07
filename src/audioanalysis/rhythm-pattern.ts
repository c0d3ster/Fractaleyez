import modelData from './rhythm-model.json'

/**
 * The rhythm names the Beat HUD can show (precision on held-out tracks in tempo.md). Two-step is a breakbeat read with more confidence:
 * the readings that sure are nearly all drum and bass, whose kick plays 1 and the "and" of 3.
 */
export type RhythmPattern = 'four on the floor' | 'breakbeat' | 'two-step'

/** What the rhythm namer reads: each onset band's own hits over the last few bars (ms, oldest first) and the tempo tracker's beat. */
export type RhythmInput = {
  bandOnsets: ReadonlyArray<readonly number[]>
  periodMs: number | null
}

/** A reading: the likeliest pattern and how sure the model is of it (0 to 1). `pattern` is null below that name's threshold. */
export type RhythmReading = {
  pattern: RhythmPattern | null
  likeliest: 'four on the floor' | 'breakbeat' | 'half time' | null
  confidence: number
}

export type RhythmOptions = {
  /** Confidence a name needs before it is shown: four on the floor for at least 90% precision on the tune half of every set, breakbeat for
   * about 80% (a choice for coverage), two-step (the breakbeat class read more surely) for 90%. */
  minConfidence: Record<RhythmPattern, number>
  /** How far (ms) from exactly n beats later a second hit may land and still count as the pattern repeating. */
  partnerToleranceMs: number
  /** The span the onsets are counted over (the window they were taken from). */
  windowMs: number
}

// Tuned on the tune halves (Raveform folds 0 to 3, half of GiantSteps clean and through a laptop mic by id hash) by rhythm-fit.py.
export const DEFAULT_RHYTHM_OPTIONS: RhythmOptions = {
  minConfidence: { 'four on the floor': 0.7, breakbeat: 0.85, 'two-step': 0.95 },
  partnerToleranceMs: 40,
  windowMs: 12000,
}

type RhythmModel = { classes: string[]; features: string[]; mean: number[]; scale: number[]; coef: number[][]; intercept: number[] }
const MODEL = modelData as RhythmModel

// The lags (in beats) each band's repeats are measured at: the beat and its multiples, the off-beat lags of a two-step, a third and a
// quarter of a beat (triplet and sixteenth hats). Named the way rhythm-model.json names its features.
const LAGS: ReadonlyArray<[string, number]> = [
  ['0.5', 0.5], ['1', 1], ['1.5', 1.5], ['2', 2], ['2.5', 2.5], ['3', 3], ['4', 4], ['t', 1 / 3], ['0.25', 0.25], ['0.75', 0.75],
]
const PHASE_BINS = 6
const BAND_COUNT = 5
const BASS = 0
const HI = 3
const MIN_PHASE_HITS = 4

/**
 * The share of onsets (those early enough to have one) with another onset `lagMs` later, give or take `toleranceMs`. Reads the pattern
 * repeating, so an extra hit between the kicks (a bass note, a tom) does not break it the way it breaks the gaps between neighbours.
 */
export const repeatShare = (onsets: readonly number[], lagMs: number, toleranceMs: number): number => {
  const last = onsets[onsets.length - 1]
  if (last === undefined) return 0
  let considered = 0
  let repeated = 0
  let j = 0
  for (const time of onsets) {
    if (time > last - lagMs + toleranceMs) break
    considered++
    const target = time + lagMs
    while (j < onsets.length && (onsets[j] ?? Infinity) < target - toleranceMs) j++
    if (j < onsets.length && Math.abs((onsets[j] ?? Infinity) - target) <= toleranceMs) repeated++
  }
  return considered < 2 ? 0 : repeated / considered
}

// Where the hi band's hits fall after the latest kick, as shares of each sixth of a beat (zero with too few kicks or hats).
const hatPhases = (kicks: readonly number[], hats: readonly number[], periodMs: number): number[] => {
  const hist = new Array<number>(PHASE_BINS).fill(0)
  let counted = 0
  let k = 0
  hats.forEach((hat) => {
    while (k + 1 < kicks.length && (kicks[k + 1] ?? Infinity) <= hat) k++
    const kick = kicks[k]
    if (kick === undefined || kick > hat) return
    const phase = ((((hat - kick) / periodMs) % 1) + 1) % 1
    hist[Math.min(PHASE_BINS - 1, Math.floor(phase * PHASE_BINS))]!++
    counted++
  })
  return counted >= MIN_PHASE_HITS && kicks.length >= MIN_PHASE_HITS ? hist.map((n) => n / counted) : hist.fill(0)
}

/** The features the model reads, in rhythm-model.json's order: per band its hits per beat and repeat shares, then the hats' phases. */
export const rhythmFeatures = ({ bandOnsets, periodMs }: RhythmInput, options: Partial<RhythmOptions> = {}): number[] | null => {
  const o = { ...DEFAULT_RHYTHM_OPTIONS, ...options }
  if (periodMs === null || periodMs <= 0) return null
  const beats = o.windowMs / periodMs
  const perBand = Array.from({ length: BAND_COUNT }, (_, b) => {
    const onsets = bandOnsets[b] ?? []
    return [onsets.length / beats, ...LAGS.map(([, lag]) => repeatShare(onsets, lag * periodMs, o.partnerToleranceMs))]
  })
  return [...perBand.flat(), ...hatPhases(bandOnsets[BASS] ?? [], bandOnsets[HI] ?? [], periodMs)]
}

// Multinomial logistic regression over the standardized features.
const probabilities = (features: readonly number[]): number[] => {
  const logits = MODEL.coef.map((row, k) => row.reduce((sum, w, i) => sum + w * (((features[i] ?? 0) - (MODEL.mean[i] ?? 0)) / (MODEL.scale[i] ?? 1)), MODEL.intercept[k] ?? 0))
  const top = Math.max(...logits)
  const exp = logits.map((x) => Math.exp(x - top))
  const total = exp.reduce((sum, x) => sum + x, 0)
  return exp.map((x) => x / total)
}

// The model's classes, as RhythmReading names them.
const asClass = (name: string | undefined): RhythmReading['likeliest'] =>
  name === 'four on the floor' || name === 'breakbeat' || name === 'half time' ? name : null

const shownName = (likeliest: RhythmReading['likeliest'], confidence: number, o: RhythmOptions): RhythmPattern | null => {
  if (likeliest === 'four on the floor') return confidence >= o.minConfidence['four on the floor'] ? likeliest : null
  if (likeliest !== 'breakbeat') return null
  if (confidence >= o.minConfidence['two-step']) return 'two-step'
  return confidence >= o.minConfidence.breakbeat ? 'breakbeat' : null
}

/**
 * The rhythm the drums make against the beat, from each onset band's own hits (not the merged beats, which mix kick and hats and drop
 * whatever lands within the Ignore Time), with a confidence. A model reads how often each band's hits repeat at the beat, its multiples and
 * the off-beat lags of a two-step: four on the floor when the kick repeats every beat, breakbeat for a broken kick (drum and bass, breaks),
 * two-step when that is read surely enough to be drum and bass's kick on 1 and the "and" of 3. Half time is a class the model knows but never shows: it could not be told from breaks at 90% precision. The tempo
 * itself is not a feature, so the name says what the drums do, not what the BPM suggests.
 */
export const readRhythm = (input: RhythmInput, options: Partial<RhythmOptions> = {}): RhythmReading => {
  const o = { ...DEFAULT_RHYTHM_OPTIONS, ...options }
  const features = rhythmFeatures(input, o)
  if (features === null) return { pattern: null, likeliest: null, confidence: 0 }
  const p = probabilities(features)
  const best = p.reduce((at, x, i) => (x > (p[at] ?? 0) ? i : at), 0)
  const likeliest = asClass(MODEL.classes[best])
  const confidence = p[best] ?? 0
  return { pattern: shownName(likeliest, confidence, o), likeliest, confidence }
}

/** The name alone, or null when no name is confident enough (a breakdown, silence, a rhythm the model does not know). */
export const nameRhythm = (input: RhythmInput, options: Partial<RhythmOptions> = {}): RhythmPattern | null => readRhythm(input, options).pattern

// Tempo ranges for each pattern, chosen from the labelled tempos and genres of GiantSteps and Raveform (tempo.md). They say what the tempo is
// typical of, not what the genre is. Lower bound inclusive, upper exclusive. Between ranges there is no suffix.
const TEMPO_RANGES: Record<RhythmPattern, ReadonlyArray<{ from: number; to: number; text: string }>> = {
  'four on the floor': [
    { from: 115, to: 130, text: 'house & techno tempo' },
    { from: 137, to: 150, text: 'trance tempo' },
  ],
  breakbeat: [{ from: 160, to: 185, text: 'drum & bass tempo' }],
  'two-step': [{ from: 160, to: 185, text: 'drum & bass tempo' }],
}

/** The tempo range a pattern's BPM falls in ("house & techno tempo"), or null outside every range. */
export const tempoRange = (pattern: RhythmPattern, bpm: number | null): string | null => {
  if (bpm === null) return null
  return TEMPO_RANGES[pattern].find(({ from, to }) => bpm >= from && bpm < to)?.text ?? null
}

/** The line the Beat HUD shows: the held pattern and the tempo range it is played at. */
export type RhythmLabel = {
  pattern: RhythmPattern | null
  tempoRange: string | null
  confidence: number
  text: string
}

export type RhythmHoldOptions = {
  /** How often (ms) the labeler takes a reading, however often it is asked. */
  stepMs: number
  /** A name shows once it has been read this many readings in a row (2 s at 500 ms). */
  enterReadings: number
  /** A shown name stays until this many readings in a row do not confirm it (3 s), so a fill or a dropped kick does not blank it. */
  leaveReadings: number
}

export const DEFAULT_RHYTHM_HOLD: RhythmHoldOptions = { stepMs: 500, enterReadings: 4, leaveReadings: 6 }

const EMPTY_LABEL: RhythmLabel = { pattern: null, tempoRange: null, confidence: 0, text: '' }

/**
 * Holds the rhythm name so it does not flicker: a new name shows after it has been read confidently a few readings in a row, and a shown
 * name clears only after a few readings without it. Steps every `stepMs` however often it is read, so the main window and a popped-out
 * config window can both ask without speeding it up.
 */
export class RhythmLabeler {
  private readonly hold: RhythmHoldOptions
  private readonly options: Partial<RhythmOptions>
  private shown: RhythmPattern | null = null
  private candidate: RhythmPattern | null = null
  private streak = 0
  private misses = 0
  private lastStepMs = -Infinity
  private label: RhythmLabel = EMPTY_LABEL

  constructor(hold: Partial<RhythmHoldOptions> = {}, options: Partial<RhythmOptions> = {}) {
    this.hold = { ...DEFAULT_RHYTHM_HOLD, ...hold }
    this.options = options
  }

  read = (input: RhythmInput, nowMs: number): RhythmLabel => {
    if (nowMs - this.lastStepMs < this.hold.stepMs) return this.label
    this.lastStepMs = nowMs
    const reading = readRhythm(input, this.options)
    this.step(reading.pattern)
    const bpm = input.periodMs === null || input.periodMs <= 0 ? null : 60000 / input.periodMs
    if (this.shown === null) {
      this.label = EMPTY_LABEL
      return this.label
    }
    const range = tempoRange(this.shown, bpm)
    const confidence = reading.pattern === this.shown ? reading.confidence : 0
    this.label = { pattern: this.shown, tempoRange: range, confidence, text: range === null ? this.shown : `${this.shown} · ${range}` }
    return this.label
  }

  reset = (): void => {
    this.shown = null
    this.candidate = null
    this.streak = 0
    this.misses = 0
    this.lastStepMs = -Infinity
    this.label = EMPTY_LABEL
  }

  private step = (pattern: RhythmPattern | null): void => {
    this.streak = pattern === this.candidate ? this.streak + 1 : 1
    this.candidate = pattern
    if (pattern === this.shown) {
      this.misses = 0
    } else if (this.shown !== null) {
      this.misses++
      if (this.misses >= this.hold.leaveReadings) this.shown = null
    }
    if (pattern !== null && pattern !== this.shown && this.streak >= this.hold.enterReadings) {
      this.shown = pattern
      this.misses = 0
    }
  }
}
