import { describe, expect, it } from 'vitest'

import { DEFAULT_RHYTHM_OPTIONS, nameRhythm, readRhythm, RhythmInput, RhythmLabeler, RhythmOptions, tempoRange } from './rhythm-pattern'

const WINDOW_MS = 12000
const FRAME_MS = 1000 / 60

// Hits at these places in a bar (in beats from its start), repeated over the window, for one band.
const hits = (positions: number[], beat: number): number[] => {
  const bars = Math.ceil(WINDOW_MS / (4 * beat))
  return Array.from({ length: bars }, (_, b) => positions.map((p) => (b * 4 + p) * beat)).flat().filter((t) => t < WINDOW_MS)
}

// Each band's level over the window: a hit that decays over about 120 ms, on a quiet floor.
const levelsFor = (bands: number[][]): NonNullable<RhythmInput['levels']> =>
  Array.from({ length: Math.round(WINDOW_MS / FRAME_MS) }, (_, i) => {
    const t = i * FRAME_MS
    return {
      t,
      bands: bands.map((list) => {
        const last = list.filter((hit) => hit <= t).pop()
        return { level: 0.5 + (last === undefined ? 0 : 30 * Math.exp(-(t - last) / 120)) }
      }),
    }
  })

// Bands: bass, lo, mid, hi, air.
const input = (positions: number[][], bpm: number): RhythmInput => {
  const beat = 60000 / bpm
  const bandOnsets = positions.map((p) => hits(p, beat))
  return { bandOnsets, periodMs: beat, levels: levelsFor(bandOnsets), nowMs: WINDOW_MS - 1 }
}
const EIGHTHS = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]
const FOUR = [[0, 1, 2, 3], [0, 1, 2, 3], [1, 3], [0.5, 1.5, 2.5, 3.5], EIGHTHS]
// Drum and bass: kick on 1 and the "and" of 3, snare on 2 and 4.
const TWO_STEP = [[0, 2.5], [0, 2.5], [1, 3], EIGHTHS, EIGHTHS]
const BARE_TWO_STEP = [[0, 2.5], [], [1, 3], [1, 3], []]
const options = (minConfidence: Partial<RhythmOptions['minConfidence']>): Partial<RhythmOptions> => ({ minConfidence: { ...DEFAULT_RHYTHM_OPTIONS.minConfidence, ...minConfidence } })

describe('readRhythm', () => {
  it('calls a kick on every beat four on the floor, with or without the rest of the kit, at any tempo', () => {
    for (const bpm of [124, 128, 140, 174]) {
      expect(nameRhythm(input(FOUR, bpm))).toBe('four on the floor')
      expect(nameRhythm(input([[0, 1, 2, 3], [], [], [], []], bpm))).toBe('four on the floor')
    }
  })

  it('reads drum and bass as a breakbeat, and as a two-step when sure enough', () => {
    expect(nameRhythm(input(TWO_STEP, 174))).toBe('breakbeat')
    expect(nameRhythm(input(BARE_TWO_STEP, 174))).toBe('two-step')
    expect(readRhythm(input(TWO_STEP, 140)).likeliest).toBe('breakbeat')
  })

  it('names half time only at 130 to 150 BPM', () => {
    const always = options({ 'four on the floor': 1.01, 'half time': 0 })
    expect(nameRhythm(input(BARE_TWO_STEP, 140), always)).toBe('half time')
    expect(nameRhythm(input(BARE_TWO_STEP, 174), always)).not.toBe('half time')
    expect(nameRhythm(input(BARE_TWO_STEP, 124), always)).not.toBe('half time')
  })

  it('says nothing without a tempo, in silence, or with too few hits', () => {
    expect(nameRhythm({ ...input(FOUR, 128), periodMs: null })).toBeNull()
    expect(nameRhythm(input([[], [], [], [], []], 128))).toBeNull()
    expect(nameRhythm(input([[], [], [], [0], []], 128))).toBeNull()
  })

  it('holds back a name below its confidence threshold', () => {
    expect(nameRhythm(input(FOUR, 128), options({ 'four on the floor': 0.9999 }))).toBeNull()
  })
})

describe('tempoRange', () => {
  it('names the tempo range a pattern is played at, and nothing between ranges', () => {
    expect(tempoRange('four on the floor', 124)).toBe('house & techno tempo')
    expect(tempoRange('four on the floor', 140)).toBe('trance tempo')
    expect(tempoRange('four on the floor', 133)).toBeNull()
    expect(tempoRange('breakbeat', 174)).toBe('drum & bass tempo')
    expect(tempoRange('breakbeat', 128)).toBeNull()
    expect(tempoRange('two-step', 172)).toBe('drum & bass tempo')
    expect(tempoRange('half time', 140)).toBe('dubstep tempo')
    expect(tempoRange('four on the floor', null)).toBeNull()
  })
})

describe('RhythmLabeler', () => {
  const FOUR_AT_128 = input(FOUR, 128)
  const SILENT = input([[], [], [], [], []], 128)
  // Reads the labeler every 500 ms, `count` times, from `start`.
  const run = (labeler: RhythmLabeler, reading: RhythmInput, start: number, count: number): string[] =>
    Array.from({ length: count }, (_, i) => labeler.read(reading, start + i * 500).text)

  it('shows a name after 3 s of confident readings, and keeps its tempo range out of the text', () => {
    const labeler = new RhythmLabeler()
    const texts = run(labeler, FOUR_AT_128, 0, 6)
    expect(texts.slice(0, 5)).toEqual(['', '', '', '', ''])
    expect(texts[5]).toBe('four on the floor')
    expect(labeler.read(FOUR_AT_128, 3000).tempoRange).toBe('house & techno tempo')
  })

  it('keeps the name through a short gap and clears it after 5 s without it', () => {
    const labeler = new RhythmLabeler()
    run(labeler, FOUR_AT_128, 0, 6)
    const gap = run(labeler, SILENT, 3000, 10)
    expect(gap.slice(0, 9).every((text) => text === 'four on the floor')).toBe(true)
    expect(gap[9]).toBe('')
  })

  it('takes one reading per step however often it is asked', () => {
    const labeler = new RhythmLabeler()
    for (let t = 0; t < 2400; t += 50) labeler.read(FOUR_AT_128, t)
    expect(labeler.read(FOUR_AT_128, 2450).text).toBe('')
    expect(labeler.read(FOUR_AT_128, 2500).text).toBe('four on the floor')
  })
})
