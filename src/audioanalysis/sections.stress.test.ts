import { describe, expect, it } from 'vitest'

import { SectionTracker, SongSection } from './sections'

const FRAME_MS = 16

// Deterministic noise so a failure reproduces.
const makeRandom = (seed: number): (() => number) => {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

type Frame = { levels: number[]; beat: boolean }

const run = (script: (s: number) => Frame, seconds: number, gain = 1, noise = 0): Array<{ section: SongSection; at: number }> => {
  const tracker = new SectionTracker()
  const random = makeRandom(7)
  const seen: Array<{ section: SongSection; at: number }> = []
  let lastBeatAt = -Infinity
  for (let t = 0; t <= seconds * 1000; t += FRAME_MS) {
    const frame = script(t / 1000)
    const levels = frame.levels.map((level) => Math.max(0, level * gain * (1 + (random() - 0.5) * 2 * noise)))
    const beat = frame.beat && t - lastBeatAt > 60
    if (beat) lastBeatAt = t
    tracker.push({ t, levels, beat })
    const { section } = tracker.getState()
    if (seen[seen.length - 1]?.section !== section) seen.push({ section, at: t / 1000 })
  }
  return seen
}

const beatEvery = (periodMs: number, s: number): boolean => {
  const step = Math.max(1, Math.round(periodMs / FRAME_MS))
  return Math.round((s * 1000) / FRAME_MS) % step === 0
}

const groove = (s: number): Frame => ({ levels: [10, 6, 3, 4, 2], beat: beatEvery(500, s) })

const buildScript = (buildStart: number, dropAt: number): ((s: number) => Frame) => (s) => {
  if (s < buildStart || s >= dropAt) return groove(s)
  const p = (s - buildStart) / (dropAt - buildStart)
  return { levels: [2, 2, 3, 4 + 12 * p, 2 + 12 * p], beat: beatEvery(500 - 375 * p, s) }
}

describe('SectionTracker under realistic conditions', () => {
  it('finds the buildup and drop with noisy levels', () => {
    const seen = run(buildScript(40, 52), 62, 1, 0.25)
    const names = seen.map(({ section }) => section)
    expect(names).toContain('buildup')
    expect(names).toContain('drop')
    expect(names.filter((n) => n === 'drop')).toHaveLength(1)
  })

  it('gives the same labels at a tenth of the level (quiet mic)', () => {
    const loud = run(buildScript(40, 52), 62).map(({ section }) => section)
    const quiet = run(buildScript(40, 52), 62, 0.1).map(({ section }) => section)
    expect(quiet).toEqual(loud)
  })

  it('stays groove with noise and no structure', () => {
    const names = run(groove, 90, 1, 0.3).map(({ section }) => section)
    expect(names).toEqual(['groove'])
  })

  it('finds a short, 6 second buildup', () => {
    const names = run(buildScript(40, 46), 56).map(({ section }) => section)
    expect(names).toContain('buildup')
    expect(names).toContain('drop')
  })

  it('finds a second buildup and drop in the same song', () => {
    const script = (s: number): Frame => (s < 70 ? buildScript(40, 52)(s) : buildScript(80, 92)(s))
    const names = run(script, 105).map(({ section }) => section)
    expect(names.filter((n) => n === 'buildup').length).toBeGreaterThanOrEqual(2)
    expect(names.filter((n) => n === 'drop').length).toBeGreaterThanOrEqual(2)
  })

  it('does not call a drop without a buildup or break before it', () => {
    const script = (s: number): Frame => (s < 40 ? { levels: [4, 3, 3, 4, 2], beat: beatEvery(500, s) } : { levels: [14, 9, 4, 4, 2], beat: beatEvery(500, s) })
    const names = run(script, 55).map(({ section }) => section)
    expect(names).not.toContain('drop')
  })

  it('treats a long gap in samples (tab in the background) as a fresh start', () => {
    const tracker = new SectionTracker()
    for (let t = 0; t <= 40000; t += FRAME_MS) tracker.push({ t, levels: [10, 6, 3, 4, 2], beat: beatEvery(500, t / 1000) })
    for (let t = 400000; t <= 405000; t += FRAME_MS) tracker.push({ t, levels: [0.1, 0.1, 0.1, 0.1, 0.1], beat: false })
    expect(tracker.getState().section).toBe('groove')
    expect(tracker.getHistory().every((slot) => slot.t >= 400000)).toBe(true)
  })

  it('keeps a bounded history and stays fast', () => {
    const tracker = new SectionTracker()
    const start = performance.now()
    for (let t = 0; t <= 600000; t += FRAME_MS) tracker.push({ t, levels: [10, 6, 3, 4, 2], beat: beatEvery(500, t / 1000) })
    const elapsed = performance.now() - start
    expect(tracker.getHistory().length).toBeLessThanOrEqual(481)
    // Ten minutes of 60fps audio frames should cost a tiny fraction of a second.
    expect(elapsed).toBeLessThan(500)
  })
})

describe('SectionTracker drop accuracy', () => {
  // A kick that thumps on every beat: its peaks are several dB over its own average.
  const kickGroove = (s: number, bassBase = 3): Frame => {
    const phase = (s % 0.5) / 0.5
    const kick = Math.exp(-phase * 6)
    return { levels: [bassBase + 14 * kick, 3 + 5 * kick, 3, 4, 2], beat: beatEvery(500, s) }
  }

  it('does not read a single kick as the low end coming back', () => {
    const script = (s: number): Frame => (s > 30 && s < 40 ? { levels: [1, 1, 2.5, 3.5, 2], beat: false } : kickGroove(s))
    const names = run(script, 60).map(({ section }) => section)
    // The break itself may be named, but the kicks inside the groove must not fire drops by themselves.
    expect(names.filter((n) => n === 'drop').length).toBeLessThanOrEqual(1)
  })

  it('does not call a drop after a break that only lasted a moment', () => {
    const script = (s: number): Frame => (s > 31 && s < 32.6 ? { levels: [1, 1, 2.5, 3.5, 2], beat: false } : kickGroove(s))
    const names = run(script, 50).map(({ section }) => section)
    expect(names).not.toContain('drop')
  })

  it('calls the low end returning after a quiet gap a drop', () => {
    const script = (s: number): Frame => (s > 30 && s < 36 ? { levels: [0.05, 0.05, 0.05, 0.05, 0.05], beat: false } : kickGroove(s))
    const names = run(script, 50).map(({ section }) => section)
    expect(names).toContain('quiet')
    expect(names).toContain('drop')
  })

  it('does not flicker in and out of quiet while a dip hovers near the line', () => {
    // Hovers around the quiet line for 10 seconds.
    const script = (s: number): Frame => {
      if (s > 30 && s < 40) {
        const wobble = 0.16 + 0.1 * Math.sin(s * 3)
        return { levels: [10 * wobble, 6 * wobble, 3 * wobble, 4 * wobble, 2 * wobble], beat: false }
      }
      return groove(s)
    }
    const names = run(script, 60).map(({ section }) => section)
    const flips = names.filter((n) => n === 'quiet').length
    expect(flips).toBeLessThanOrEqual(1)
  })
})
