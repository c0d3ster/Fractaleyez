import { describe, expect, it } from 'vitest'
import { TempoTracker } from '../src/tempo-tracker'

// How accurate the tracker is on real music is measured offline against labelled tempos (scripts/section-eval/bpm-eval.mts). These pin
// what must hold on clean synthetic beats: the right tempo at any frame rate, dotted hats not taken for the beat, a clean switch when the
// tempo really changes, a held tempo through a breakdown, nothing in silence, and the same answer at any level.

type Part = { seconds: number; bpm: number | null; dottedHats?: boolean; level?: number }

// Five band levels per frame: a decaying kick on every beat (bass, a little lo), a clap on beats 2 and 4 (hi), hats on the off-beats or
// every three sixteenths (air), over a steady pad (mid). A part with no bpm is the pad alone (a breakdown), or silence at level 0.
const render = (parts: Part[], fps: number): Array<{ t: number; levels: number[] }> => {
  const frames: Array<{ t: number; levels: number[] }> = []
  const frameMs = 1000 / fps
  let t = 0
  let partStart = 0
  for (const { seconds, bpm, dottedHats = false, level = 1 } of parts) {
    const end = partStart + seconds * 1000
    for (; t < end; t += frameMs) {
      const local = t - partStart
      if (bpm === null) {
        frames.push({ t, levels: [0.3, 0.5, 3, 0.4, 0.3].map((v) => v * level) })
        continue
      }
      const beatMs = 60000 / bpm
      const sinceBeat = local % beatMs
      const beat = Math.floor(local / beatMs)
      const kick = Math.exp(-sinceBeat / 60)
      const clap = beat % 2 === 1 ? Math.exp(-sinceBeat / 40) : 0
      const hatStep = dottedHats ? (beatMs * 3) / 4 : beatMs
      const sinceHat = (local + (dottedHats ? 0 : beatMs / 2)) % hatStep
      const hat = Math.exp(-sinceHat / 25)
      frames.push({ t, levels: [0.2 + 12 * kick, 0.5 + 3 * kick, 3, 0.4 + 5 * clap, 0.3 + 4 * hat].map((v) => v * level) })
    }
    partStart = end
  }
  return frames
}

const play = (parts: Part[], fps = 60): Array<{ t: number; bpm: number | null }> => {
  const tracker = new TempoTracker()
  return render(parts, fps).map(({ t, levels }) => {
    tracker.push(t, levels)
    return { t, bpm: tracker.getBpm() }
  })
}

const at = (readings: Array<{ t: number; bpm: number | null }>, seconds: number): number | null =>
  readings.find(({ t }) => t >= seconds * 1000)?.bpm ?? null

describe('TempoTracker', () => {
  it('finds a steady tempo at any frame rate', () => {
    for (const fps of [30, 60, 144]) {
      for (const bpm of [124, 140, 174]) {
        const found = at(play([{ seconds: 30, bpm }], fps), 29)
        expect(found).not.toBeNull()
        expect(Math.abs(found! - bpm) / bpm).toBeLessThan(0.02)
      }
    }
  })

  it('does not take hats every three sixteenths for the beat', () => {
    const found = at(play([{ seconds: 30, bpm: 128, dottedHats: true }]), 29)
    expect(Math.abs(found! - 128)).toBeLessThan(3)
  })

  it('holds still on a steady track (the number shown never jumps)', () => {
    const readings = play([{ seconds: 60, bpm: 128 }]).filter(({ t }) => t > 15000)
    expect(readings.every(({ bpm }) => bpm !== null && Math.abs(bpm - 128) < 2)).toBe(true)
  })

  it('moves to a new tempo once it has clearly taken over, and only once', () => {
    const readings = play([{ seconds: 40, bpm: 124 }, { seconds: 40, bpm: 150 }])
    expect(Math.abs(at(readings, 39)! - 124)).toBeLessThan(2)
    expect(Math.abs(at(readings, 79)! - 150)).toBeLessThan(3)
    const after = readings.filter(({ t }) => t > 40000).map(({ bpm }) => Math.round(bpm ?? 0))
    const jumps = after.filter((bpm, i) => i > 0 && Math.abs(bpm - after[i - 1]!) > 5).length
    expect(jumps).toBeLessThanOrEqual(1)
  })

  it('holds the tempo through a breakdown with no beat', () => {
    const readings = play([{ seconds: 30, bpm: 128 }, { seconds: 15, bpm: null }, { seconds: 10, bpm: 128 }])
    expect(Math.abs(at(readings, 44)! - 128)).toBeLessThan(2)
    expect(Math.abs(at(readings, 54)! - 128)).toBeLessThan(2)
  })

  it('shows nothing in a long silence', () => {
    const readings = play([{ seconds: 30, bpm: 128 }, { seconds: 45, bpm: null, level: 0 }])
    expect(at(readings, 74)).toBeNull()
  })

  it('gives the same tempo at a tenth of the level (a quiet mic)', () => {
    const loud = at(play([{ seconds: 30, bpm: 132 }]), 29)
    const quiet = at(play([{ seconds: 30, bpm: 132, level: 0.1 }]), 29)
    expect(quiet).toBeCloseTo(loud!, 0)
  })
})
