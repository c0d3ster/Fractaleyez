import { describe, expect, it } from 'vitest'

import { dropShare } from './video-drop'

describe('dropShare', () => {
  it('is 0 without an earlier reading', () => {
    expect(dropShare(null, { dropped: 5, total: 100 })).toBe(0)
  })

  it('is the dropped share of the frames since the earlier reading', () => {
    expect(dropShare({ dropped: 2, total: 100 }, { dropped: 7, total: 200 })).toBeCloseTo(0.05)
  })

  it('is 0 when no new frames arrived', () => {
    expect(dropShare({ dropped: 2, total: 100 }, { dropped: 2, total: 100 })).toBe(0)
  })

  it('is 0 when the counters restarted on a new element', () => {
    expect(dropShare({ dropped: 40, total: 900 }, { dropped: 1, total: 20 })).toBe(0)
  })
})
