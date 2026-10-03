import { describe, expect, it } from 'vitest'

import { stepOpacity } from './fade'

describe('stepOpacity', () => {
  it('snaps when the duration is 0', () => {
    expect(stepOpacity(0, 1, 16, 0)).toBe(1)
    expect(stepOpacity(1, 0, 16, 0)).toBe(0)
  })

  it('moves linearly over the duration', () => {
    expect(stepOpacity(0, 1, 250, 1000)).toBe(0.25)
    expect(stepOpacity(1, 0, 250, 1000)).toBe(0.75)
  })

  it('does not overshoot the target', () => {
    expect(stepOpacity(0.9, 1, 500, 1000)).toBe(1)
    expect(stepOpacity(0.1, 0, 500, 1000)).toBe(0)
  })

  it('reverses from the current value mid-fade', () => {
    const up = stepOpacity(0, 1, 400, 1000)
    expect(stepOpacity(up, 0, 100, 1000)).toBeCloseTo(0.3)
  })
})
