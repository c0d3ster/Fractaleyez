import { describe, expect, it } from 'vitest'

import { OFF_SCORE, ON_SCORE, RISER_LEVELS, RiserLevel, levelForScore } from './riserLevel'

// Steps the meter every 50 ms through a list of [score, durationMs] and returns the bars at the end.
const run = (meter: RiserLevel, steps: ReadonlyArray<readonly [number, number]>, start = 0): { level: number; t: number } => {
  let t = start
  let level = 0
  steps.forEach(([score, durationMs]) => {
    for (let elapsed = 0; elapsed < durationMs; elapsed += 50) {
      t += 50
      level = meter.step(score, t)
    }
  })
  return { level, t }
}

describe('levelForScore', () => {
  it('is 0 under the on score and climbs to the top level', () => {
    expect(levelForScore(ON_SCORE - 0.01)).toBe(0)
    expect(levelForScore(ON_SCORE)).toBe(1)
    expect(levelForScore(0.95)).toBe(RISER_LEVELS)
    expect(levelForScore(1)).toBe(RISER_LEVELS)
  })
})

describe('RiserLevel', () => {
  it('shows nothing for the usual wobble under the on score', () => {
    const meter = new RiserLevel()
    const wobble: Array<[number, number]> = Array.from({ length: 40 }, (_, i) => [i % 2 === 0 ? 0.15 : 0.45, 100])
    expect(run(meter, wobble).level).toBe(0)
  })

  it('ignores a short spike over the on score', () => {
    const meter = new RiserLevel()
    expect(run(meter, [[0.2, 1000], [0.9, 300], [0.2, 1000]]).level).toBe(0)
  })

  it('shows a held riser and climbs with it', () => {
    const meter = new RiserLevel()
    expect(run(meter, [[0.55, 600]]).level).toBe(1)
    expect(run(meter, [[0.97, 400]], 600).level).toBe(RISER_LEVELS)
  })

  it('stays on between the off and on scores, and goes off under the off score one bar at a time', () => {
    const meter = new RiserLevel()
    const { t } = run(meter, [[0.97, 800]])
    expect(run(meter, [[(OFF_SCORE + ON_SCORE) / 2, 300]], t).level).toBe(RISER_LEVELS)
    const after = run(meter, [[OFF_SCORE - 0.1, 450]], t + 300)
    expect(after.level).toBe(RISER_LEVELS - 1)
    expect(run(meter, [[OFF_SCORE - 0.1, 3000]], after.t).level).toBe(0)
  })

  it('does not drop a bar for a dip inside the margin', () => {
    const meter = new RiserLevel()
    const { t, level } = run(meter, [[0.75, 1000]])
    expect(run(meter, [[0.74, 1000]], t).level).toBe(level)
  })
})
