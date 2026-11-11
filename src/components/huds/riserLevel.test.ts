import { describe, expect, it } from 'vitest'

import { OFF_SCORE, ON_SCORE, RISER_LEVELS, RiserLevel, levelForScore } from './riserLevel'

type Trace = { levels: number[]; t: number }

// Steps the meter every 50 ms through a list of [score, durationMs] and returns every level it showed.
const run = (meter: RiserLevel, steps: ReadonlyArray<readonly [number, number]>, start = 0): Trace => {
  let t = start
  const levels: number[] = []
  steps.forEach(([score, durationMs]) => {
    for (let elapsed = 0; elapsed < durationMs; elapsed += 50) {
      t += 50
      levels.push(meter.step(score, t))
    }
  })
  return { levels, t }
}

const last = ({ levels }: Trace): number => levels[levels.length - 1] ?? 0

describe('levelForScore', () => {
  it('is 0 under the on score and climbs to the top level', () => {
    expect(levelForScore(ON_SCORE - 0.01)).toBe(0)
    expect(levelForScore(ON_SCORE)).toBe(1)
    expect(levelForScore(0.96)).toBe(RISER_LEVELS)
    expect(levelForScore(1)).toBe(RISER_LEVELS)
  })
})

describe('RiserLevel', () => {
  it('shows nothing for wobble under the on score', () => {
    const wobble: Array<[number, number]> = Array.from({ length: 40 }, (_, i) => [i % 2 === 0 ? 0.1 : ON_SCORE - 0.02, 100])
    expect(run(new RiserLevel(), wobble).levels.every((level) => level === 0)).toBe(true)
  })

  it('ignores a spike shorter than the show hold', () => {
    expect(last(run(new RiserLevel(), [[0.1, 500], [0.9, 100], [0.1, 500]]))).toBe(0)
  })

  it('climbs one bar at a time even when the score is already high', () => {
    const { levels } = run(new RiserLevel(), [[0.97, 1500]])
    const shown = levels.filter((level, i) => level > 0 && level !== levels[i - 1])
    expect(shown).toEqual([1, 2, 3, 4, 5])
  })

  it('never steps down while the riser holds', () => {
    const { levels } = run(new RiserLevel(), [[0.6, 800], [0.9, 800], [0.75, 800]])
    levels.forEach((level, i) => expect(level).toBeGreaterThanOrEqual(i > 0 ? (levels[i - 1] ?? 0) : 0))
  })

  it('goes off at once when the score falls under the off score', () => {
    const meter = new RiserLevel()
    const { t } = run(meter, [[0.97, 1500]])
    const after = run(meter, [[OFF_SCORE - 0.05, 200]], t)
    expect(after.levels.filter((level) => level > 0 && level < RISER_LEVELS)).toEqual([])
    expect(last(after)).toBe(0)
  })

  it('goes off when the score drops well under its peak, before reaching the off score', () => {
    const meter = new RiserLevel()
    const { t } = run(meter, [[0.97, 1500]])
    expect(last(run(meter, [[0.5, 200]], t))).toBe(0)
  })
})
