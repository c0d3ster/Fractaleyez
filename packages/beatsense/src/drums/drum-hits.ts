import modelData from './drum-hit-model.json'
import { checkInputLayout, checkLength, forward, sigmoid, standardize, type Layer } from '../shared/mlp'
import { BandTracker, thresholdDbFor, type BandReading, type ReferenceWindow } from '../onset/onset-detector'

// The kick's, the hats', the snare's and the clap's hits, for the Frequency HUD's lights and the snare roll (roll-rate.ts). A rise in
// a band is not an instrument: a rise in lo or mid fired 150 times a minute on a kick alone, 230 on hats and 200 on bass plucks on test clips,
// and about 250 times a minute on real EDM. So each rise is a candidate, and a small model (drum-hit-model.json: one hidden layer of tanh units
// and one sigmoid output per drum, trained on one-shot kicks, hats, snares and claps over synthetic beds, through clean, room and laptop mics:
// scripts/section-eval/drum-gen.py, drum-eval.mts, drum-train.py) says which drums it is from the shape it has across all five bands a moment
// after it starts. It can be more than one: a clap on 2 and 4 lands with the kick.
//
// The trackers have the roll's short window: the beat detector compares a hit with the loudest level 40 to 150 ms before it, and a sixteenth
// at 128 BPM is only 117 ms after the last one, so that hit's peak is still in the window and an even roll never clears it. Here the window
// ends 70 ms back (sixteenths at 150 BPM are 100 ms apart, so the last hit's peak is always out of it).
const REFERENCE: ReferenceWindow = { windowMs: 70, guardMs: 25 }
// The trackers' level gate, as a fraction of each band's loudness (the beat detector's is 0.25, -12 dB). That gate kept half the hats that do
// not land on another drum from ever being a candidate: a hat 12 dB under the snare that set the air band's loudness is still a hat.
const MIN_LEVEL_OF_LOUDNESS = 0.1
const BAND_COUNT = 5
// A candidate is called this long after its first edge (two frames at 60 fps): the hit has reached every band by then.
const CLASSIFY_AFTER_MS = 2000 / 60
// Edges this close to the first are the same hit (lo, mid, hi and air have the same window, so one hit reaches them within a frame). A later
// edge is a candidate of its own, even while the one before is still waiting to be called, so a hat just before a snare does not hide it.
const MERGE_MS = 20
// Two calls of the same drum this close are one hit (sixteenths at 150 BPM are 100 ms apart).
const SAME_HIT_MS = 45
// The level a hit adds to is the band's mean power over this span before the first edge (the frames the model was trained on).
const BEFORE_FROM_MS = 120
const BEFORE_TO_MS = 30
const HISTORY_SLOTS = 64
const RISE_FLOOR_DB = -12
const POWER_EPS = 1e-4
const KEEP_MS = 3000
// No candidates for this long after the first frame (the beat detector's warm-up): the trackers have no reference yet, so the audio coming up
// from silence reads as one big hit.
const WARMUP_MS = 1000
// The rise a candidate needs, as a Threshold slider value (3 dB): fixed, because the model was trained on candidates at this rise
// (drum-eval.mts), so moving the beat detector's slider must not change what reaches it.
export const DRUM_SENSITIVITY = 2

export const DRUM_KINDS = ['kick', 'hat', 'snare', 'clap'] as const
export type DrumKind = (typeof DRUM_KINDS)[number]

/** `thresholds`: how sure the model has to be for each drum, chosen on held-out folds (drum-train.py). */
export type DrumHitModel = { kinds: string[]; features: string[]; mean: number[]; scale: number[]; hidden: Layer; output: Layer; thresholds: number[] }
/** The bundled drum model (drum-hit-model.json); `DrumHits` takes another as its second argument, with the same inputs (checkDrumModel). */
export const DRUM_HIT_MODEL: DrumHitModel = modelData

/**
 * Where each drum's hits sit in frequency (Hz), for placing its light under the Frequency HUD: the band centres on a log scale, weighted by
 * the power a hit adds to each, median over hits in the test clips. Kick and snare read the same on every set of clips measured (79 to 88 and
 * 390 to 400 Hz), the clap between 1.2 and 1.8 kHz; the hats, whose air-band burst has mostly decayed by the time a candidate is read, only
 * read clearly on clean hits with nothing else in the mix (5 kHz).
 */
export const DRUM_CENTER_HZ: Record<DrumKind, number> = { kick: 88, hat: 5000, snare: 390, clap: 1300 }

/** Every candidate, as the model saw it: for replaying clips offline and retraining (drum-eval.mts). */
export type DrumCandidate = { t: number; features: number[]; probabilities: number[]; kinds: DrumKind[] }

// `peak`: each band's highest power from the first edge to the frame the candidate is called on (a hat's air-band burst is mostly gone by then).
type Pending = { t: number; edges: boolean[]; before: number[]; peak: number[] }

const log10 = (value: number): number => Math.log10(value)

/**
 * The model's inputs, in drum-hit-model.json's order: per band the rise over its reference (dB, the largest in the last 40 ms), its level
 * against its loudness, its share of the power the hit added (log10), the hit's size against the bed, per band the added power against its
 * own bed (log10), which bands had an edge, and then per band the power added at its peak since the first edge against its bed and as a share
 * of all the bands' (log10).
 */
export const drumFeatures = (
  trackers: readonly BandTracker[],
  readings: readonly BandReading[],
  levels: readonly number[],
  { before, edges, peak }: Pick<Pending, 'before' | 'edges' | 'peak'>,
): number[] => {
  const added = before.map((power, b) => Math.max(0, (levels[b] ?? 0) ** 2 - power) + POWER_EPS)
  const bed = before.map((power) => power + POWER_EPS)
  const addedTotal = added.reduce((sum, v) => sum + v, 0)
  const bedTotal = bed.reduce((sum, v) => sum + v, 0)
  const addedAtPeak = before.map((power, b) => Math.max(0, (peak[b] ?? 0) - power) + POWER_EPS)
  const addedAtPeakTotal = addedAtPeak.reduce((sum, v) => sum + v, 0)
  return [
    ...trackers.map(({ recentRiseDb }) => Math.max(RISE_FLOOR_DB, recentRiseDb)),
    ...readings.map(({ level, loudness }) => (loudness > 0 ? level / loudness : 0)),
    ...added.map((v) => log10(v) - log10(addedTotal)),
    log10(addedTotal) - log10(bedTotal),
    ...added.map((v, b) => log10(v) - log10(bed[b] ?? POWER_EPS)),
    ...edges.map((edge) => (edge ? 1 : 0)),
    ...addedAtPeak.map((v, b) => log10(v) - log10(bed[b] ?? POWER_EPS)),
    ...addedAtPeak.map((v) => log10(v) - log10(addedAtPeakTotal)),
  ]
}

const checkedDrumModels = new WeakSet<DrumHitModel>()

/**
 * Throws unless `model` fits the vector drumFeatures builds: the bundled model's inputs in its order, one mean, scale and hidden weight per
 * input, one output weight per hidden unit, and one output and threshold per kind. Checked once per model.
 */
export const checkDrumModel = (model: DrumHitModel): void => {
  if (checkedDrumModels.has(model)) return
  const what = 'Drum hit model'
  const { features, mean, scale, hidden, output, kinds, thresholds } = model
  checkInputLayout(what, features, DRUM_HIT_MODEL.features, { mean, scale })
  hidden.weights.forEach((row, j) => checkLength(what, `hidden row ${j}`, row, features.length))
  checkLength(what, 'hidden bias', hidden.bias, hidden.weights.length)
  output.weights.forEach((row, k) => checkLength(what, `output row ${k}`, row, hidden.weights.length))
  checkLength(what, 'output rows', output.weights, kinds.length)
  checkLength(what, 'output bias', output.bias, kinds.length)
  checkLength(what, 'thresholds', thresholds, kinds.length)
  checkedDrumModels.add(model)
}

/** The model's probability for each drum (kick, hat, snare, clap), each on its own: they do not add up to one. */
export const drumProbabilities = (features: readonly number[], model: DrumHitModel = DRUM_HIT_MODEL): number[] => {
  checkDrumModel(model)
  return forward(model, standardize(model, features)).map(sigmoid)
}

const kindsOf = (probabilities: readonly number[], model: DrumHitModel): DrumKind[] =>
  DRUM_KINDS.filter((kind) => {
    const k = model.kinds.indexOf(kind)
    return k >= 0 && (probabilities[k] ?? 0) > (model.thresholds[k] ?? 1)
  })

/**
 * Runs every frame beside the beat detector, on the raw band levels, with a fixed rise (DRUM_SENSITIVITY). No noise gates: the roll is only read
 * while the tempo tracker shows a tempo, which is when the beat detector's gates are off too.
 */
export class DrumHits {
  private readonly trackers = Array.from({ length: BAND_COUNT }, () => new BandTracker(undefined, REFERENCE, MIN_LEVEL_OF_LOUDNESS))
  private readonly hits: number[][] = DRUM_KINDS.map(() => [])
  private readonly rollHits: ReadonlyArray<readonly number[]>
  private readonly last: Array<number | null> = DRUM_KINDS.map(() => null)
  // Recent frames' times and power per band, for the level a hit adds to.
  private readonly historyT = new Float64Array(HISTORY_SLOTS)
  private readonly historyPower = new Float64Array(HISTORY_SLOTS * BAND_COUNT)
  private head = 0
  private count = 0
  private readonly pending: Pending[] = []
  private firstT: number | null = null

  constructor(private readonly onCandidate?: (candidate: DrumCandidate) => void, private readonly model: DrumHitModel = DRUM_HIT_MODEL) {
    checkDrumModel(model)
    this.rollHits = [this.listOf('snare'), this.listOf('clap')]
  }

  push = (t: number, levels: readonly number[], dtMs: number, sensitivity: number): void => {
    const thresholdDb = thresholdDbFor(sensitivity)
    const steps = this.trackers.map((tracker, b) => tracker.step(levels[b] ?? 0, Math.max(dtMs, 1), thresholdDb, false))
    if (this.firstT === null) this.firstT = t
    const warm = t - this.firstT >= WARMUP_MS
    const edges = steps.map(({ risingEdge }) => warm && risingEdge)
    if (edges.some(Boolean)) {
      const newest = this.pending[this.pending.length - 1]
      if (newest && t - newest.t < MERGE_MS) edges.forEach((edge, b) => { if (edge) newest.edges[b] = true })
      else this.pending.push({ t, edges: [...edges], before: this.powerBefore(t), peak: new Array<number>(BAND_COUNT).fill(0) })
    }
    this.pending.forEach(({ peak }) => levels.forEach((level, b) => { if (b < BAND_COUNT) peak[b] = Math.max(peak[b] ?? 0, level ** 2) }))
    while (this.pending.length > 0 && t - this.pending[0]!.t >= CLASSIFY_AFTER_MS - 0.5) this.classify(this.pending.shift()!, steps, levels)
    this.hits.forEach((times) => { while (times.length > 0 && t - times[0]! > KEEP_MS) times.shift() })
    this.record(t, levels)
  }

  /** Each drum's hits over the last few seconds (ms, oldest first), in DRUM_KINDS order. Not a copy: do not keep it. */
  getHits = (): ReadonlyArray<readonly number[]> => this.hits

  /** The snare's and the clap's hits, the ones the snare roll is read from (roll-rate.ts). Not a copy: do not keep it. */
  getRollHits = (): ReadonlyArray<readonly number[]> => this.rollHits

  /** When each drum last hit (the time of the candidate's first edge), or null before the first. */
  getLastHits = (): Record<DrumKind, number | null> => ({
    kick: this.last[0] ?? null, hat: this.last[1] ?? null, snare: this.last[2] ?? null, clap: this.last[3] ?? null,
  })

  private listOf = (kind: DrumKind): number[] => this.hits[DRUM_KINDS.indexOf(kind)]!

  private classify = (candidate: Pending, steps: ReadonlyArray<{ reading: BandReading }>, levels: readonly number[]): void => {
    const features = drumFeatures(this.trackers, steps.map(({ reading }) => reading), levels, candidate)
    const probabilities = drumProbabilities(features, this.model)
    const kinds = kindsOf(probabilities, this.model)
    kinds.forEach((kind) => {
      const k = DRUM_KINDS.indexOf(kind)
      const last = this.last[k]
      if (last !== null && last !== undefined && candidate.t - last < SAME_HIT_MS) return
      this.hits[k]!.push(candidate.t)
      this.last[k] = candidate.t
    })
    this.onCandidate?.({ t: candidate.t, features, probabilities, kinds })
  }

  private record = (t: number, levels: readonly number[]): void => {
    this.historyT[this.head] = t
    for (let b = 0; b < BAND_COUNT; b++) this.historyPower[this.head * BAND_COUNT + b] = (levels[b] ?? 0) ** 2
    this.head = (this.head + 1) % HISTORY_SLOTS
    this.count = Math.min(this.count + 1, HISTORY_SLOTS)
  }

  // Mean power per band over the frames BEFORE_FROM_MS to BEFORE_TO_MS before `t` (zero before there are any).
  private powerBefore = (t: number): number[] => {
    const sums = new Array<number>(BAND_COUNT).fill(0)
    let n = 0
    for (let i = 0; i < this.count; i++) {
      const slot = (this.head - 1 - i + HISTORY_SLOTS) % HISTORY_SLOTS
      const age = t - (this.historyT[slot] ?? 0)
      if (age > BEFORE_FROM_MS + 0.5) break
      if (age < BEFORE_TO_MS - 0.5) continue
      for (let b = 0; b < BAND_COUNT; b++) sums[b]! += this.historyPower[slot * BAND_COUNT + b] ?? 0
      n++
    }
    return sums.map((sum) => (n > 0 ? sum / n : 0))
  }
}
