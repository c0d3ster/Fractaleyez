import { describe, expect, it } from 'vitest'

import { hasMoreBelow, MORE_BELOW_SLACK_PX } from './moreBelow'

describe('hasMoreBelow', () => {
  it('is true while content runs past the bottom edge', () => {
    expect(hasMoreBelow({ scrollTop: 0, scrollHeight: 400, clientHeight: 200 })).toBe(true)
    expect(hasMoreBelow({ scrollTop: 150, scrollHeight: 400, clientHeight: 200 })).toBe(true)
  })

  it('is false at the end and when everything fits', () => {
    expect(hasMoreBelow({ scrollTop: 200, scrollHeight: 400, clientHeight: 200 })).toBe(false)
    expect(hasMoreBelow({ scrollTop: 0, scrollHeight: 200, clientHeight: 200 })).toBe(false)
  })

  it('treats a fractional last pixel or two as the end', () => {
    expect(hasMoreBelow({ scrollTop: 200 - MORE_BELOW_SLACK_PX + 0.5, scrollHeight: 400, clientHeight: 200 })).toBe(false)
  })
})
