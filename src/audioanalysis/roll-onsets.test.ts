import { describe, expect, it } from 'vitest'

import { rollLevel } from '../automode/roll-rate'
import { BandTracker, thresholdDbFor } from './onset-detector'
import { RollOnsets } from './roll-onsets'

const BPM = 128
const PERIOD = 60000 / BPM
const SIXTEENTH = PERIOD / 4
// A snare hit in the lo band: an instant rise over a steady bed, decaying with a 35 ms time constant (a short roll sample).
const BED = 0.15
const snare = (sinceMs: number): number => (sinceMs >= 0 ? Math.exp(-sinceMs / 35) : 0)

// Band levels at `fps` for an even roll of `gapMs` from 1 s to `endMs`, hits all the same height.
const rollFrames = (gapMs: number, endMs: number, fps: number): Array<{ t: number; levels: number[] }> => {
  const frameMs = 1000 / fps
  const frames: Array<{ t: number; levels: number[] }> = []
  for (let t = 0; t <= endMs; t += frameMs) {
    const since = t < 1000 ? -1 : (t - 1000) % gapMs
    const lo = BED + snare(since)
    frames.push({ t, levels: [BED, lo, BED + snare(since) / 2, BED, BED] })
  }
  return frames
}

const hitsIn = (frames: Array<{ t: number; levels: number[] }>, fps: number): number => {
  const roll = new RollOnsets()
  frames.forEach(({ t, levels }) => roll.push(t, levels, 1000 / fps, 2))
  return roll.getOnsets()[1]!.filter((time) => time > 1500).length
}

describe('RollOnsets', () => {
  it('catches an even sixteenth roll at 128 BPM, at 240 and at 60 fps', () => {
    const end = 3000
    const expected = Math.floor((end - 1500) / SIXTEENTH)
    expect(hitsIn(rollFrames(SIXTEENTH, end, 240), 240)).toBeGreaterThanOrEqual(expected - 1)
    expect(hitsIn(rollFrames(SIXTEENTH, end, 60), 60)).toBeGreaterThanOrEqual(expected - 1)
  })

  it('catches what the beat detector\'s 150 ms window misses', () => {
    // The same roll through a tracker with the beat detector's window: most hits never clear the last one's peak.
    const tracker = new BandTracker()
    let beatHits = 0
    rollFrames(SIXTEENTH, 3000, 240).forEach(({ t, levels }) => {
      if (tracker.step(levels[1]!, 1000 / 240, thresholdDbFor(2), false).risingEdge && t > 1500) beatHits++
    })
    expect(beatHits).toBeLessThan(hitsIn(rollFrames(SIXTEENTH, 3000, 240), 240) / 2)
  })

  it('reads the roll as sixteenths, eighths and quarters', () => {
    const levelOf = (gapMs: number): ReturnType<typeof rollLevel> => {
      const roll = new RollOnsets()
      rollFrames(gapMs, 4000, 240).forEach(({ t, levels }) => roll.push(t, levels, 1000 / 240, 2))
      return rollLevel(roll.getOnsets(), PERIOD, 4000)
    }
    expect(levelOf(SIXTEENTH)).toBe(16)
    expect(levelOf(PERIOD / 2)).toBe(8)
    expect(levelOf(PERIOD)).toBe(4)
  })

  it('keeps only the last few seconds, and nothing outside the snare bands', () => {
    const roll = new RollOnsets()
    rollFrames(SIXTEENTH, 8000, 240).forEach(({ t, levels }) => roll.push(t, levels, 1000 / 240, 2))
    const onsets = roll.getOnsets()
    expect(onsets[1]!.every((time) => time >= 8000 - 3000)).toBe(true)
    expect(onsets[0]).toEqual([])
    expect(onsets[3]).toEqual([])
  })
})
