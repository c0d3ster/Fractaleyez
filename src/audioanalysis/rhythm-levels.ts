/** One frame of the band levels the level features read (BeatSample has this shape). */
export type LevelFrame = { t: number; bands: ReadonlyArray<{ level: number }> }

// The bands read: bass, lo and mid, where a wobble bass lives (through a laptop mic it is mostly in lo and mid).
const LEVEL_BANDS = [0, 1, 2]
// Lags (in beats) the envelope's autocorrelation is read at: the wobble rates (a sixteenth, a triplet, an eighth, a beat, two beats).
export const LEVEL_LAGS: ReadonlyArray<[string, number]> = [['0.25', 0.25], ['t', 1 / 3], ['0.5', 0.5], ['1', 1], ['2', 2]]
const GRID_MS = 20
const WINDOW_MS = 5000
const MIN_FRAMES = 100
const SUSTAIN_SHARE = 0.5
const FLOOR = 1e-4

/** The feature names, in order: per band, how much of the time it is near its peak, its peak against its mean, and the autocorrelation of its envelope at each lag. */
export const LEVEL_FEATURE_NAMES: readonly string[] = LEVEL_BANDS.map((b) => [`s${b}`, `c${b}`, ...LEVEL_LAGS.map(([name]) => `a${b}_${name}`)]).flat()

// The level history on an even 20 ms grid (the latest frame at or before each grid time), over the last WINDOW_MS.
const resample = (frames: readonly LevelFrame[], band: number, nowMs: number): number[] => {
  const out: number[] = []
  let i = 0
  for (let t = nowMs - WINDOW_MS; t <= nowMs; t += GRID_MS) {
    while (i + 1 < frames.length && (frames[i + 1]?.t ?? Infinity) <= t) i++
    const frame = frames[i]
    if (frame !== undefined && frame.t <= t) out.push(Math.log(Math.max(FLOOR, frame.bands[band]?.level ?? 0)))
  }
  return out
}

const autocorrelation = (x: readonly number[], lag: number): number => {
  const n = x.length - lag
  if (lag < 1 || n < 2) return 0
  const mean = x.reduce((sum, v) => sum + v, 0) / x.length
  let num = 0
  let den = 0
  for (let i = 0; i < x.length; i++) den += ((x[i] ?? 0) - mean) ** 2
  for (let i = 0; i < n; i++) num += ((x[i] ?? 0) - mean) * ((x[i + lag] ?? 0) - mean)
  return den > 0 ? num / den : 0
}

/**
 * What the low bands' levels do between the hits, over the last 5 s, for the rhythm model: a wobble bass holds the band near its peak most
 * of the time and pulses at a beat-locked rate, a kick is a short spike once a beat. Zeros without a tempo or with too short a history.
 */
export const levelFeatures = (frames: readonly LevelFrame[], nowMs: number, periodMs: number | null): number[] => {
  if (periodMs === null || periodMs <= 0) return LEVEL_FEATURE_NAMES.map(() => 0)
  return LEVEL_BANDS.map((band) => {
    const logLevel = resample(frames, band, nowMs)
    if (logLevel.length < MIN_FRAMES) return [0, 0, ...LEVEL_LAGS.map(() => 0)]
    const linear = logLevel.map(Math.exp)
    const peak = Math.max(...linear)
    const mean = linear.reduce((sum, v) => sum + v, 0) / linear.length
    const sustain = linear.filter((v) => v >= SUSTAIN_SHARE * peak).length / linear.length
    const crest = mean > 0 ? peak / mean : 0
    return [sustain, crest, ...LEVEL_LAGS.map(([, lag]) => autocorrelation(logLevel, Math.round((lag * periodMs) / GRID_MS)))]
  }).flat()
}
