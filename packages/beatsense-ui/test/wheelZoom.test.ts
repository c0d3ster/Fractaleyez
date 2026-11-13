import { describe, expect, it } from 'vitest'
import { zoomView } from '../src/wheelZoom'

const RANGE = { minMs: 30000, maxMs: 120000 }

describe('zoomView', () => {
  it('shows more time on a turn down and less on a turn up', () => {
    expect(zoomView(60000, 100, RANGE)).toBeGreaterThan(60000)
    expect(zoomView(60000, -100, RANGE)).toBeLessThan(60000)
  })

  it('stays within the range', () => {
    expect(zoomView(60000, 100000, RANGE)).toBe(120000)
    expect(zoomView(60000, -100000, RANGE)).toBe(30000)
  })
})
