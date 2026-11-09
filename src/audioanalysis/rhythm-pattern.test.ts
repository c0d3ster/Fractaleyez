import { describe, expect, it } from 'vitest'

import { nameRhythm, readRhythm, RhythmInput, RhythmLabeler } from './rhythm-pattern'

const BEAT = 60000 / 128
const WINDOW_MS = 12000

// Hits at these places in a bar (in beats from its start), repeated over the window, for one band.
const hits = (positions: number[], beat: number = BEAT): number[] => {
  const bars = Math.ceil(WINDOW_MS / (4 * beat))
  return Array.from({ length: bars }, (_, b) => positions.map((p) => (b * 4 + p) * beat)).flat().filter((t) => t < WINDOW_MS)
}

// Bands: bass, lo, mid, hi, air.
const input = (bands: number[][], beat: number = BEAT): RhythmInput => ({ bandOnsets: bands.map((positions) => hits(positions, beat)), periodMs: beat })
const EIGHTHS = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]
const FOUR = [[0, 1, 2, 3], [0, 1, 2, 3], [1, 3], [0.5, 1.5, 2.5, 3.5], EIGHTHS]
// Drum and bass: kick on 1 and the "and" of 3, snare on 2 and 4.
const TWO_STEP = [[0, 2.5], [0, 2.5], [1, 3], EIGHTHS, EIGHTHS]
const SILENT: RhythmInput = { bandOnsets: [[], [], [], [], []], periodMs: BEAT }

describe('readRhythm', () => {
  it('calls a kick on every beat four on the floor, with or without the rest of the kit, at any tempo', () => {
    for (const bpm of [124, 128, 140, 174]) {
      expect(nameRhythm(input(FOUR, 60000 / bpm))).toBe('four on the floor')
      expect(nameRhythm(input([[0, 1, 2, 3], [], [], [], []], 60000 / bpm))).toBe('four on the floor')
    }
  })

  it('keeps four on the floor when a bass note lands between some kicks', () => {
    expect(nameRhythm(input([[0, 1, 2, 2.75, 3], [], [], [0.5, 1.5, 2.5, 3.5], []]))).toBe('four on the floor')
  })

  it('reads a two-step as a breakbeat, and as a two-step when sure enough', () => {
    for (const bpm of [140, 174]) {
      const reading = readRhythm(input(TWO_STEP, 60000 / bpm))
      expect(reading.likeliest).toBe('breakbeat')
      expect(reading.pattern).toBe('breakbeat')
    }
    // The kit without hats on every eighth reads more like the drum and bass the model learned from.
    expect(nameRhythm(input([[0, 2.5], [], [1, 3], [1, 3], []], 60000 / 174))).toBe('two-step')
  })

  it('says nothing without a tempo, or with only a few hits (a breakdown)', () => {
    expect(nameRhythm({ ...input(FOUR), periodMs: null })).toBeNull()
    expect(nameRhythm(SILENT)).toBeNull()
    expect(nameRhythm(input([[], [], [], [0], []]))).toBeNull()
    expect(nameRhythm(input([[0], [0, 2], [], [], []]))).toBeNull()
  })

  it('holds back a name below its confidence threshold', () => {
    expect(nameRhythm(input(FOUR), { minConfidence: { 'four on the floor': 0.999, breakbeat: 0.85, 'two-step': 0.95 } })).toBeNull()
  })
})

describe('RhythmLabeler', () => {
  // Reads the labeler every 500 ms, `count` times, from `start`.
  const run = (labeler: RhythmLabeler, reading: RhythmInput, start: number, count: number): string[] =>
    Array.from({ length: count }, (_, i) => labeler.read(reading, start + i * 500).text)

  it('shows a name after 2 s of confident readings', () => {
    const labeler = new RhythmLabeler()
    const texts = run(labeler, input(FOUR), 0, 5)
    expect(texts.slice(0, 3)).toEqual(['', '', ''])
    expect(texts[3]).toBe('four on the floor')
  })

  it('keeps the name through a short gap and clears it after 3 s without it', () => {
    const labeler = new RhythmLabeler()
    run(labeler, input(FOUR), 0, 4)
    const gap = run(labeler, SILENT, 2000, 6)
    expect(gap.slice(0, 5).every((text) => text.startsWith('four on the floor'))).toBe(true)
    expect(gap[5]).toBe('')
  })

  it('takes one reading per step however often it is asked', () => {
    const labeler = new RhythmLabeler()
    for (let t = 0; t < 1400; t += 50) labeler.read(input(FOUR), t)
    expect(labeler.read(input(FOUR), 1450).text).toBe('')
    expect(labeler.read(input(FOUR), 1500).text).toBe('four on the floor')
  })
})
