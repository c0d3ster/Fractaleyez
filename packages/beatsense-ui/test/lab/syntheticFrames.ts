import type { CaptureFrame, FrameReading, SongSection } from 'beatsense'

// Synthetic input for the lab's recording tests (no microphone here): readings as the AnalysisHost gives them, and capture frames as the
// worklet makes them, with a kick on every beat so the real analysers fire.

export const FRAME_MS = 1000 / 60

type ReadingOptions = { beatEveryFrames?: number; section?: (t: number) => SongSection }

/** `count` readings from frame `first`, a beat every `beatEveryFrames` frames, each with its own levels array. */
export const syntheticReadings = (count: number, first: number = 0, { beatEveryFrames = 30, section = (): SongSection => 'groove' }: ReadingOptions = {}): FrameReading[] =>
  Array.from({ length: count }, (_, i) => {
    const n = first + i
    const t = n * FRAME_MS
    const beat = n % beatEveryFrames === 0
    return {
      t,
      levels: [beat ? 40 : 4, 3, 2 + (n % 7), 1, 0.5],
      beat,
      beatBand: beat ? 0 : null,
      bpm: n > 120 ? 120 : null,
      section: section(t),
      riser: (n % 600) / 600,
      sweep: 0,
    }
  })

/** Capture frames at 120 BPM (a frame index is 1-based, as the worklet's): a bass kick on each beat over a steady hat-like air band. */
export const syntheticCaptureFrames = (count: number): CaptureFrame[] =>
  Array.from({ length: count }, (_, i) => {
    const index = i + 1
    const sinceBeat = index % 30
    const kick = sinceBeat < 3 ? 60 * (1 - sinceBeat / 3) : 0
    return { index, energy: 1, levels: [2 + kick, 1 + kick / 4, 1.5, 1, 2 + (index % 15 === 0 ? 6 : 0)] }
  })

/** A seeded random number generator (mulberry32), so a synthetic song is the same on every run. */
/* eslint-disable no-bitwise -- mulberry32 is integer bit mixing by design */
export const seededRandom = (seed: number): (() => number) => {
  let a = seed >>> 0
  return (): number => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
/* eslint-enable no-bitwise */

/**
 * The band levels of a synthetic song at 60 frames a second: 120 BPM, in 8 s sections that each pick their own loudness and which drums
 * play, with random fills, so (like a real song) no stretch repeats the rest exactly.
 */
export const syntheticSongLevels = (seconds: number, seed: number): number[][] => {
  const random = seededRandom(seed)
  const frames = Math.round(seconds * 60)
  const out: number[][] = []
  let section = { energy: 1, kick: true, hats: true, snare: true }
  const decay = [0, 0, 0, 0, 0]
  for (let n = 0; n < frames; n++) {
    if (n % 480 === 0) section = { energy: 0.4 + random(), kick: random() > 0.2, hats: random() > 0.3, snare: random() > 0.4 }
    const step = n % 30
    if (step === 0 && section.kick) decay[0] = 1
    if (step === 15 && section.hats) decay[4] = 0.8
    if (n % 60 === 30 && section.snare) decay[3] = 0.9
    if (random() < 0.02) decay[Math.floor(random() * 5)] = 0.5 + random() * 0.5
    out.push(decay.map((d, b) => section.energy * (2 + 40 * d) * (1 + 0.2 * b)))
    for (let b = 0; b < 5; b++) decay[b] = decay[b]! * 0.82
  }
  return out
}

/** Readings of frames [from, to) of a song's levels, as one pass heard them: on its own clock, at another volume, with a little noise. */
export const passOf = (
  levels: readonly number[][], from: number, to: number, { clockMs = 0, gain = 1, noise = 0, seed = 1 }: { clockMs?: number; gain?: number; noise?: number; seed?: number } = {},
): FrameReading[] => {
  const random = seededRandom(seed)
  return levels.slice(from, to).map((frame, i) => ({
    t: clockMs + i * FRAME_MS,
    levels: frame.map((level) => Math.max(0, level * gain * (1 + noise * (random() - 0.5)))),
    beat: false,
    beatBand: null,
    bpm: null,
    section: 'groove',
    riser: 0,
    sweep: 0,
  }))
}
