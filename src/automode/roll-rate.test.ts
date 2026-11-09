import { describe, expect, it } from 'vitest'
import { RollReader, rollLevel } from './roll-rate'

const PERIOD = 500 // 120 BPM

// Snare hits `gapMs` apart ending at `endMs`, as the snare band (1) sees them; the other bands are empty.
const hitsEvery = (gapMs: number, count: number, endMs: number): number[][] => [
  [],
  Array.from({ length: count }, (_, i) => endMs - (count - 1 - i) * gapMs),
  [],
  [],
  [],
]

describe('rollLevel', () => {
  it('reads quarters and eighths from the gap against the beat, and anything faster as eighths', () => {
    expect(rollLevel(hitsEvery(500, 4, 5000), PERIOD, 5000)).toBe(4)
    expect(rollLevel(hitsEvery(250, 6, 5000), PERIOD, 5000)).toBe(8)
    expect(rollLevel(hitsEvery(125, 10, 5000), PERIOD, 5000)).toBe(8)
  })

  it('needs a tempo to measure against', () => {
    expect(rollLevel(hitsEvery(250, 6, 5000), null, 5000)).toBeNull()
  })

  it('is null with fewer than three hits, which is all a backbeat ever has in the window', () => {
    expect(rollLevel(hitsEvery(1000, 2, 5000), PERIOD, 5000)).toBeNull()
    expect(rollLevel(hitsEvery(500, 2, 5000), PERIOD, 5000)).toBeNull()
  })

  it('is null once the roll has stopped for a beat', () => {
    expect(rollLevel(hitsEvery(250, 6, 5000), PERIOD, 5400)).toBe(8)
    expect(rollLevel(hitsEvery(250, 6, 5000), PERIOD, 5600)).toBeNull()
  })

  it('follows a roll that doubles its speed once two of the newest gaps are at the new speed', () => {
    const quartersThenEighths = [[], [3000, 3500, 4000, 4500, 4750, 5000], [], [], []]
    // Newest gaps: 500, 250, 250 -> the middle one (250) is eighths.
    expect(rollLevel(quartersThenEighths, PERIOD, 5000)).toBe(8)
    // One gap into it, quarters still: 500, 500, 250.
    expect(rollLevel([[], [3000, 3500, 4000, 4500, 4750], [], [], []], PERIOD, 4750)).toBe(4)
  })

  it('counts the same snare seen in two bands once', () => {
    const doubled = [[], [4000, 4500, 5000], [4010, 4510, 5010], [], []]
    expect(rollLevel(doubled, PERIOD, 5010)).toBe(4)
  })

  it('ignores the kick and the hats', () => {
    const kickAndHats = [[4000, 4500, 5000], [], [], [], [4000, 4125, 4250, 4375, 4500, 4625, 4750, 4875, 5000]]
    expect(rollLevel(kickAndHats, PERIOD, 5000)).toBeNull()
  })
})


describe('RollReader', () => {
  // Reads every 20 ms from `from` to `to` over the same hits, returning what it showed at each read.
  const readOver = (reader: RollReader, hits: number[][], from: number, to: number): Array<4 | 8 | null> => {
    const shown: Array<4 | 8 | null> = []
    for (let t = from; t <= to; t += 20) shown.push(reader.read(hits.map((band) => band.filter((time) => time <= t)), PERIOD, t))
    return shown
  }

  it('shows a note value once it has been read for half a beat', () => {
    const reader = new RollReader()
    const hits = hitsEvery(250, 12, 5500)
    // The raw reading starts at the third hit (3500); half a beat later it shows.
    expect(reader.read(hits.map((band) => band.filter((time) => time <= 3500)), PERIOD, 3500)).toBeNull()
    expect(readOver(reader, hits, 3520, 3800).at(-1)).toBe(8)
  })

  it('keeps showing through a dropped hit, and clears a beat after the roll stops', () => {
    const reader = new RollReader()
    // Eighths with one hit missing at 4500: the raw reading wobbles there.
    const hits = [[], [3000, 3250, 3500, 3750, 4000, 4250, 4750, 5000], [], [], []]
    const shown = readOver(reader, hits, 3500, 5400)
    expect(shown.slice(shown.indexOf(8))).not.toContain(null)
    expect(readOver(reader, hits, 5420, 6100).at(-1)).toBeNull()
  })

  it('does not swap for one odd gap', () => {
    const reader = new RollReader()
    const eighths = hitsEvery(250, 8, 4750)
    readOver(reader, eighths, 3500, 4750)
    // One late hit makes the newest gaps read as quarters for a moment, then eighths again.
    const withLate = [[], [...(eighths[1] ?? []), 5150, 5400, 5650, 5900], [], [], []]
    expect(readOver(reader, withLate, 4760, 5900)).not.toContain(4)
  })

  it('starts from nothing after a reset', () => {
    const reader = new RollReader()
    readOver(reader, hitsEvery(250, 8, 5000), 3500, 5000)
    expect(reader.reset()).toBeNull()
    expect(reader.read(hitsEvery(250, 8, 5000), PERIOD, 5000)).toBeNull()
  })
})
