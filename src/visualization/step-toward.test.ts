import { describe, expect, it } from 'vitest'

import { stepToward } from './step-toward'

describe('stepToward', () => {
  it('moves up and down by at most the step', () => {
    expect(stepToward(10, 100, 30)).toBe(40)
    expect(stepToward(100, 10, 30)).toBe(70)
  })

  it('lands on the target instead of passing it', () => {
    expect(stepToward(95, 100, 30)).toBe(100)
    expect(stepToward(105, 100, 30)).toBe(100)
    expect(stepToward(100, 100, 30)).toBe(100)
  })

  it('stays put with no step', () => {
    expect(stepToward(10, 100, 0)).toBe(10)
  })
})
