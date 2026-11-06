import { describe, expect, it } from 'vitest'

import { SectionTracker, SongSection } from './sections'

const FRAME_MS = 16

type Frame = { levels: number[]; beat: boolean }
type Script = (seconds: number) => Frame

// Runs the script for `seconds` and returns the sections seen, in order, with the time each began.
const run = (script: Script, seconds: number): { tracker: SectionTracker; seen: Array<{ section: SongSection; at: number }> } => {
  const tracker = new SectionTracker()
  const seen: Array<{ section: SongSection; at: number }> = []
  let lastBeatAt = -Infinity
  for (let t = 0; t <= seconds * 1000; t += FRAME_MS) {
    const frame = script(t / 1000)
    tracker.push({ t, levels: frame.levels, beat: frame.beat && t - lastBeatAt > 60 })
    if (frame.beat) lastBeatAt = t
    const { section } = tracker.getState()
    if (seen[seen.length - 1]?.section !== section) seen.push({ section, at: t / 1000 })
  }
  return { tracker, seen }
}

// A beat every `periodMs`, as a function of time, so a script can speed it up.
const beatEvery = (periodMs: number) => (seconds: number): boolean => Math.round(seconds * 1000) % Math.max(1, Math.round(periodMs / FRAME_MS) * FRAME_MS) < FRAME_MS

// The labels shown from `seconds` on: every change after that, plus the one that was already showing. Before a regular beat has been going for a
// while there is no song to label, so the start of a run is quiet.
const labelsAfter = (seen: Array<{ section: SongSection; at: number }>, seconds: number): SongSection[] => {
  const before = seen.filter(({ at }) => at < seconds)
  const active = before[before.length - 1]
  return [...(active ? [active] : []), ...seen.filter(({ at }) => at >= seconds)].map(({ section }) => section)
}

const groove = (seconds: number): Frame => ({ levels: [10, 6, 3, 4, 2], beat: beatEvery(500)(seconds) })

describe('SectionTracker', () => {
  it('stays on groove through a steady beat', () => {
    const { seen } = run(groove, 60)
    expect(labelsAfter(seen, 16)).toEqual(['groove'])
  })

  it('calls a quiet passage quiet and comes back to groove', () => {
    const { seen } = run((s) => (s > 30 && s < 45 ? { levels: [0.1, 0.1, 0.1, 0.1, 0.1], beat: false } : groove(s)), 70)
    const names = seen.map(({ section }) => section)
    expect(names).toContain('quiet')
    expect(names[names.length - 1]).toBe('groove')
  })

  it('calls a low end cut a break', () => {
    const { seen } = run((s) => (s > 30 && s < 40 ? { levels: [1, 1, 2, 3, 2], beat: false } : groove(s)), 45)
    expect(seen.map(({ section }) => section)).toContain('break')
  })

  it('finds a buildup of denser hits and rising highs, then the drop', () => {
    const dropAt = 52
    const script: Script = (s) => {
      if (s < 40 || s >= dropAt) return groove(s)
      const progress = (s - 40) / (dropAt - 40)
      return { levels: [2, 2, 3, 4 + 12 * progress, 2 + 12 * progress], beat: beatEvery(500 - 375 * progress)(s) }
    }
    const { seen } = run(script, 62)
    const build = seen.find(({ section }) => section === 'buildup')
    const drop = seen.find(({ section }) => section === 'drop')
    expect(build).toBeDefined()
    expect(build!.at).toBeGreaterThan(40)
    expect(build!.at).toBeLessThan(dropAt)
    expect(drop).toBeDefined()
    expect(drop!.at).toBeGreaterThanOrEqual(dropAt)
    expect(drop!.at).toBeLessThan(dropAt + 2)
    expect(seen[seen.length - 1]!.section).toBe('groove')
  })

  it('reports buildup progress and rising intensity around a drop', () => {
    const script: Script = (s) => {
      if (s < 40) return groove(s)
      const progress = Math.min(1, (s - 40) / 12)
      return { levels: [2, 2, 3, 4 + 12 * progress, 2 + 12 * progress], beat: beatEvery(500 - 375 * progress)(s) }
    }
    const { tracker } = run(script, 50)
    const state = tracker.getState()
    expect(state.section).toBe('buildup')
    expect(state.buildupProgress).toBeGreaterThan(0)
    expect(state.intensity).toBeGreaterThan(0.5)
  })

  it('has no parts to label when there is no beat: it shows quiet', () => {
    const { seen } = run(() => ({ levels: [0.1, 0.1, 0.1, 0.1, 0.1], beat: false }), 40)
    expect(seen.every(({ section }) => section === 'groove' || section === 'quiet')).toBe(true)
    expect(seen[seen.length - 1]!.section).toBe('quiet')
  })
})
