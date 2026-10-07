import { describe, it, expect } from 'vitest'
import { isFullRange, rangePosition, rangeSpan } from './paletteRange'

describe('rangeSpan', () => {
  it('is the distance between the handles', () => {
    expect(rangeSpan(0, 1)).toBe(1)
    expect(rangeSpan(0.25, 0.75)).toBeCloseTo(0.5)
  })

  it('runs off the end and back in when the end is before the start', () => {
    expect(rangeSpan(0.75, 0.25)).toBeCloseTo(0.5)
    expect(rangeSpan(0.9, 0.1)).toBeCloseTo(0.2)
  })

  it('counts equal handles as the whole palette', () => {
    expect(rangeSpan(0.4, 0.4)).toBe(1)
  })
})

describe('rangePosition', () => {
  it('walks from the start to the end', () => {
    expect(rangePosition(0.25, 0.75, 0)).toBeCloseTo(0.25)
    expect(rangePosition(0.25, 0.75, 0.5)).toBeCloseTo(0.5)
    expect(rangePosition(0.25, 0.75, 1)).toBeCloseTo(0.75)
  })

  it('reaches the last color of the palette, not back to the first', () => {
    expect(rangePosition(0, 1, 1)).toBe(1)
  })

  it('wraps through the seam', () => {
    expect(rangePosition(0.8, 0.2, 0.5)).toBeCloseTo(1)
    expect(rangePosition(0.8, 0.2, 0.75)).toBeCloseTo(0.1)
  })
})

describe('isFullRange', () => {
  it('is only the untouched 0 to 1', () => {
    expect(isFullRange(0, 1)).toBe(true)
    expect(isFullRange(0, 0.9)).toBe(false)
    expect(isFullRange(0.1, 1)).toBe(false)
  })
})
