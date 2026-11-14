import type { FrameReading } from 'beatsense'

// Lines up two passes over the same song: finds the offset that maps one pass's audio clock onto the other's, by matching their onset
// envelopes (how much the band levels jump, frame by frame). A rise in a band's log level is the same whatever the volume, so passes played
// louder or quieter still match. The search runs coarse first (10 a second, over every offset that leaves enough overlap, or around a hint)
// and is then refined at the frame rate, to a fraction of a frame.

const FRAME_MS = 1000 / 60
/** Frames per coarse step: 6 frames is 100 ms. */
const COARSE = 6
/** How much the two passes must overlap for an offset to count, ms: enough song to tell sections apart. */
export const MIN_OVERLAP_MS = 12000
/** The peaks of a looping song repeat every bar; the runner-up is the best offset at least this far from the winner. */
const RUNNER_UP_MS = 1000

/**
 * The onset envelope on a uniform grid at the frame rate, from the first frame's time: per frame, the sum over bands of how much the log
 * level rose since the previous frame. The floor under each band's level is a hundredth of its average, so near-silence does not jump.
 */
export const onsetEnvelope = (frames: readonly FrameReading[]): { startMs: number; values: Float64Array } => {
  const first = frames[0]
  if (!first) return { startMs: 0, values: new Float64Array(0) }
  const bands = first.levels.length
  const means = new Array<number>(bands).fill(0)
  frames.forEach(({ levels }) => levels.forEach((level, b) => {
    means[b]! += level / frames.length
  }))
  const floors = means.map((mean) => Math.max(1e-6, mean * 0.01))
  const length = Math.round((frames[frames.length - 1]!.t - first.t) / FRAME_MS) + 1
  const values = new Float64Array(length)
  let previous: number[] | null = null
  let previousIndex = -2
  frames.forEach(({ t, levels }) => {
    const index = Math.round((t - first.t) / FRAME_MS)
    const logs = levels.map((level, b) => Math.log(Math.max(level, 0) + floors[b]!))
    // A gap (a frame missing) breaks the chain: no jump is counted across it.
    if (previous && index === previousIndex + 1 && index < length) {
      let rise = 0
      logs.forEach((value, b) => {
        rise += Math.max(0, value - previous![b]!)
      })
      values[index] = rise
    }
    previous = logs
    previousIndex = index
  })
  return { startMs: first.t, values }
}

/** The envelope at a lower rate: the largest value in each block of `factor`. */
const downsample = (values: Float64Array, factor: number): Float64Array => {
  const out = new Float64Array(Math.ceil(values.length / factor))
  for (let i = 0; i < values.length; i++) {
    const at = Math.floor(i / factor)
    out[at] = Math.max(out[at]!, values[i]!)
  }
  return out
}

/**
 * The correlation of ref[i] with pass[i - lag] over where both exist (Pearson, so the scale does not matter), or null with fewer than
 * `minOverlap` points in common.
 */
export const correlationAt = (ref: Float64Array, pass: Float64Array, lag: number, minOverlap: number): number | null => {
  const from = Math.max(0, lag)
  const to = Math.min(ref.length, pass.length + lag)
  const n = to - from
  if (n < minOverlap) return null
  let sumA = 0
  let sumB = 0
  let sumAA = 0
  let sumBB = 0
  let sumAB = 0
  for (let i = from; i < to; i++) {
    const a = ref[i]!
    const b = pass[i - lag]!
    sumA += a
    sumB += b
    sumAA += a * a
    sumBB += b * b
    sumAB += a * b
  }
  const cov = sumAB - (sumA * sumB) / n
  const varA = sumAA - (sumA * sumA) / n
  const varB = sumBB - (sumB * sumB) / n
  return varA > 0 && varB > 0 ? cov / Math.sqrt(varA * varB) : null
}

export type Alignment = {
  /** Add to a time on the pass's audio clock to get the reference's: song time = t + offsetMs. */
  offsetMs: number
  /**
   * The correlation at that offset, -1 to 1. Not a test of the match on its own: a steady beat correlates with any song at its tempo (two
   * different synthetic songs at 120 BPM score 0.79). What tells is how far it stands above the runner-up (see isSureAlignment).
   */
  score: number
  /** The best correlation at an offset at least a second away (a bar of a looping song), for how clearly the winner stands out. */
  runnerUp: number
  overlapMs: number
}

/** How far the winner must stand above the runner-up: the same song wins by 0.2 or more, another song at its tempo by a few hundredths. */
export const SURE_MARGIN = 0.1

/** Whether an alignment clearly beats every other offset a second or more away, so it can be trusted without a look. */
export const isSureAlignment = ({ score, runnerUp }: Pick<Alignment, 'score' | 'runnerUp'>): boolean => score - runnerUp >= SURE_MARGIN

export type AlignOptions = {
  /** A guess at the offset (from a player's song position, say) and how far from it to look, ms. Without it, every offset is tried. */
  hint?: { offsetMs: number; withinMs: number }
  /**
   * The overlap an offset needs, ms (MIN_OVERLAP_MS by default, enough song to tell its bars apart). Searching only a few hundred ms around
   * a sure hint cannot land on the wrong bar, so a short pass can be matched with less.
   */
  minOverlapMs?: number
}

/**
 * The offset that lines `pass` up with `reference`, or null when they never overlap enough or nothing correlates (silence). Both are a
 * session's frames, each on its own audio clock.
 */
export const alignPasses = (
  reference: readonly FrameReading[], pass: readonly FrameReading[], { hint, minOverlapMs = MIN_OVERLAP_MS }: AlignOptions = {},
): Alignment | null => {
  const ref = onsetEnvelope(reference)
  const other = onsetEnvelope(pass)
  if (ref.values.length === 0 || other.values.length === 0) return null
  // offsetMs = ref.startMs - other.startMs + lag * FRAME_MS, for pass frame j lined up with reference frame j + lag.
  const base = ref.startMs - other.startMs
  const lagFor = (offsetMs: number): number => (offsetMs - base) / FRAME_MS

  const refCoarse = downsample(ref.values, COARSE)
  const otherCoarse = downsample(other.values, COARSE)
  const minCoarse = Math.ceil(minOverlapMs / FRAME_MS / COARSE)
  let lo = -otherCoarse.length
  let hi = refCoarse.length
  if (hint) {
    lo = Math.max(lo, Math.floor(lagFor(hint.offsetMs - hint.withinMs) / COARSE) - 1)
    hi = Math.min(hi, Math.ceil(lagFor(hint.offsetMs + hint.withinMs) / COARSE) + 1)
  }
  const scores: Array<{ lag: number; score: number }> = []
  for (let lag = lo; lag <= hi; lag++) {
    const score = correlationAt(refCoarse, otherCoarse, lag, minCoarse)
    if (score !== null) scores.push({ lag, score })
  }
  if (scores.length === 0) return null
  const best = scores.reduce((a, b) => (b.score > a.score ? b : a))

  // Refine at the frame rate around the coarse winner, then between frames with a parabola through the peak and its neighbours.
  const minFine = Math.ceil(minOverlapMs / FRAME_MS)
  let fineLag = best.lag * COARSE
  let fineScore = -Infinity
  const fineAt = new Map<number, number>()
  for (let lag = best.lag * COARSE - 2 * COARSE; lag <= best.lag * COARSE + 2 * COARSE; lag++) {
    const score = correlationAt(ref.values, other.values, lag, minFine)
    if (score === null) continue
    fineAt.set(lag, score)
    if (score > fineScore) {
      fineScore = score
      fineLag = lag
    }
  }
  if (fineScore === -Infinity) return null
  const left = fineAt.get(fineLag - 1)
  const right = fineAt.get(fineLag + 1)
  let subFrame = 0
  if (left !== undefined && right !== undefined) {
    const curve = left - 2 * fineScore + right
    if (curve < 0) subFrame = Math.max(-0.5, Math.min(0.5, (0.5 * (left - right)) / curve))
  }
  const runnerUp = scores
    .filter(({ lag }) => Math.abs(lag - best.lag) * COARSE * FRAME_MS >= RUNNER_UP_MS)
    .reduce((top, { score }) => Math.max(top, score), -1)
  const overlapFrames = Math.min(ref.values.length, other.values.length + fineLag) - Math.max(0, fineLag)
  return {
    offsetMs: base + (fineLag + subFrame) * FRAME_MS,
    score: fineScore,
    runnerUp,
    overlapMs: overlapFrames * FRAME_MS,
  }
}
