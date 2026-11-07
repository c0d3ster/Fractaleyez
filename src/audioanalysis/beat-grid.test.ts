import { describe, expect, it } from 'vitest'
import { TempoTracker } from './tempo-tracker'
import { BeatGrid, GridState } from './beat-grid'

// How well the grid finds beats and bar lines on real music is measured offline (scripts/section-eval/grid-eval.mts). These pin what must
// hold on synthetic dance music where the answer is known: a kick on every beat, a clap on beats 2 and 4, a new bass note each bar, and a
// crash and a bigger change every 8 bars.

type Options = { bpm: number; seconds: number; fps?: number; startOffsetMs?: number }

const render = ({ bpm, seconds, fps = 60, startOffsetMs = 0 }: Options): Array<{ t: number; levels: number[] }> => {
  const frames = []
  const beatMs = 60000 / bpm
  for (let t = 0; t < seconds * 1000; t += 1000 / fps) {
    const local = t - startOffsetMs
    const beat = Math.floor(local / beatMs)
    const since = local - beat * beatMs
    const inBar = ((beat % 4) + 4) % 4
    const bar = Math.floor(beat / 4)
    const kick = Math.exp(-since / 60)
    const clap = inBar === 1 || inBar === 3 ? Math.exp(-since / 40) : 0
    // The bass note (its level) changes each bar, the pad each 8 bars, and a crash rings out on the first beat of each 8.
    const note = 1 + 0.6 * Math.sin(bar * 2.1)
    const pad = 2 + (Math.floor(bar / 8) % 2)
    const crash = inBar === 0 && bar % 8 === 0 ? Math.exp(-since / 400) : 0
    frames.push({ t, levels: [0.2 + 10 * kick * note, 0.5 + 2 * kick, pad, 0.4 + 5 * clap, 0.3 + 3 * crash + 0.5 * Math.exp(-((since + beatMs / 2) % beatMs) / 25)] })
  }
  return frames
}

const play = (options: Options): Array<{ t: number; state: GridState | null }> => {
  const tempo = new TempoTracker()
  const grid = new BeatGrid(tempo)
  const out = []
  for (const { t, levels } of render(options)) {
    tempo.push(t, levels)
    if (grid.push(t, levels)) out.push({ t, state: grid.getState() })
  }
  return out
}

describe('BeatGrid', () => {
  it('fires beats on the beat', () => {
    const beatMs = 60000 / 128
    const fired = play({ bpm: 128, seconds: 40, startOffsetMs: 137 }).filter(({ t }) => t > 20000)
    const errors = fired.map(({ state }) => {
      const phase = (((state!.lastBeatMs - 137) % beatMs) + beatMs) % beatMs
      return Math.min(phase, beatMs - phase)
    })
    expect(fired.length).toBeGreaterThan(30)
    expect(Math.max(...errors)).toBeLessThan(35)
  })

  it('finds beat 1 of the bar', () => {
    const fired = play({ bpm: 126, seconds: 60, startOffsetMs: 300 }).filter(({ t }) => t > 35000)
    const right = fired.filter(({ state }) => state!.beatInBar === (((Math.round((state!.lastBeatMs - 300) / (60000 / 126)) % 4) + 4) % 4) + 1)
    expect(right.length / fired.length).toBeGreaterThan(0.9)
  })

  it('finds the 8-bar phrase line', () => {
    const beatMs = 60000 / 126
    const fired = play({ bpm: 126, seconds: 120, startOffsetMs: 300 }).filter(({ t }) => t > 90000)
    const ones = fired.filter(({ state }) => state!.beatInBar === 1)
    const right = ones.filter(({ state }) => {
      const bar = Math.round((state!.lastBeatMs - 300) / beatMs / 4)
      return state!.barInPhrase === (((bar % 8) + 8) % 8) + 1
    })
    expect(right.length / ones.length).toBeGreaterThan(0.9)
  })
})
