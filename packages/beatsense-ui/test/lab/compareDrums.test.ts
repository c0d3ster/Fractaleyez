import { describe, expect, it } from 'vitest'

import { compareDrum, MATCH_AFTER_MS, MATCH_BEFORE_MS, median } from '../../lab/recording/compareDrums'
import type { Label } from '../../lab/recording/labels'

const kick = (id: number, t: number): Label => ({ id, kind: 'kick', t })

describe('compareDrum', () => {
  it('pairs a label with the hit just before it (the reaction time)', () => {
    const { matches, missedLabelIds, extraHitTimes } = compareDrum([kick(1, 1200), kick(2, 1700)], [1000, 1500])
    expect(matches).toEqual([
      { labelId: 1, labelT: 1200, hitT: 1000, offsetMs: 200 },
      { labelId: 2, labelT: 1700, hitT: 1500, offsetMs: 200 },
    ])
    expect(missedLabelIds).toEqual([])
    expect(extraHitTimes).toEqual([])
  })

  it('takes a hit a little after the label, but nothing outside the window', () => {
    expect(compareDrum([kick(1, 1000)], [1000 + MATCH_AFTER_MS]).matches).toHaveLength(1)
    expect(compareDrum([kick(1, 1000)], [1000 + MATCH_AFTER_MS + 1]).matches).toHaveLength(0)
    expect(compareDrum([kick(1, 1000)], [1000 - MATCH_BEFORE_MS]).matches).toHaveLength(1)
    expect(compareDrum([kick(1, 1000)], [1000 - MATCH_BEFORE_MS - 1]).matches).toHaveLength(0)
  })

  it('pairs one to one, nearest first, and reports the rest', () => {
    // Two hits near one label: the nearer pairs, the other is extra. A label with nothing near is missed.
    const { matches, missedLabelIds, extraHitTimes } = compareDrum([kick(1, 1000), kick(2, 5000)], [990, 800, 3000])
    expect(matches.map(({ labelId, hitT }) => [labelId, hitT])).toEqual([[1, 990]])
    expect(missedLabelIds).toEqual([2])
    expect(extraHitTimes).toEqual([800, 3000])
  })

  it('lets two close labels share neither hit', () => {
    const { matches } = compareDrum([kick(1, 1100), kick(2, 1150)], [1000, 1120])
    expect(matches.map(({ labelId, hitT }) => [labelId, hitT])).toEqual([[1, 1120], [2, 1000]])
  })

  it('takes the hits in any order', () => {
    expect(compareDrum([kick(1, 2200), kick(2, 1200)], [2000, 1000]).matches.map(({ hitT }) => hitT)).toEqual([1000, 2000])
  })
})

describe('median', () => {
  it('gives the middle value', () => {
    expect(median([])).toBeNull()
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 3, 2])).toBe(2.5)
  })
})
