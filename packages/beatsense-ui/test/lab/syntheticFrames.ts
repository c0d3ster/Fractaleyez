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
