import { describe, expect, it } from 'vitest'
import { rollDenominator, rollLevel } from './roll-rate'

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
  it('reads quarters, eighths and sixteenths from the gap against the beat', () => {
    expect(rollLevel(hitsEvery(500, 4, 5000), PERIOD, 5000)).toBe(1)
    expect(rollLevel(hitsEvery(250, 6, 5000), PERIOD, 5000)).toBe(2)
    expect(rollLevel(hitsEvery(125, 10, 5000), PERIOD, 5000)).toBe(3)
  })

  it('needs a tempo to measure against', () => {
    expect(rollLevel(hitsEvery(250, 6, 5000), null, 5000)).toBeNull()
  })

  it('is null with fewer than three hits, which is all a backbeat ever has in the window', () => {
    expect(rollLevel(hitsEvery(1000, 2, 5000), PERIOD, 5000)).toBeNull()
    expect(rollLevel(hitsEvery(500, 2, 5000), PERIOD, 5000)).toBeNull()
  })

  it('is null once the roll has stopped for a beat', () => {
    expect(rollLevel(hitsEvery(250, 6, 5000), PERIOD, 5400)).toBe(2)
    expect(rollLevel(hitsEvery(250, 6, 5000), PERIOD, 5600)).toBeNull()
  })

  it('follows a roll that doubles its speed once two of the newest gaps are at the new speed', () => {
    const eighthsThenSixteenths = [[], [4000, 4250, 4500, 4750, 4875, 5000], [], [], []]
    // Newest gaps: 250, 125, 125 -> the middle one (125) is sixteenths.
    expect(rollLevel(eighthsThenSixteenths, PERIOD, 5000)).toBe(3)
    // One gap into it, eighths still: 250, 250, 125.
    expect(rollLevel([[], [4000, 4250, 4500, 4750, 4875], [], [], []], PERIOD, 4875)).toBe(2)
  })

  it('counts the same snare seen in two bands once', () => {
    const doubled = [[], [4000, 4500, 5000], [4010, 4510, 5010], [], []]
    expect(rollLevel(doubled, PERIOD, 5010)).toBe(1)
  })

  it('ignores the kick and the hats', () => {
    const kickAndHats = [[4000, 4500, 5000], [], [], [], [4000, 4125, 4250, 4375, 4500, 4625, 4750, 4875, 5000]]
    expect(rollLevel(kickAndHats, PERIOD, 5000)).toBeNull()
  })
})

describe('rollDenominator', () => {
  it('names the note value', () => {
    expect([1, 2, 3].map((level) => rollDenominator(level as 1 | 2 | 3))).toEqual([4, 8, 16])
  })
})
