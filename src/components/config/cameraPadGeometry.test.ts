import { describe, it, expect } from 'vitest'
import { snapToCenter } from './cameraPadGeometry'

describe('snapToCenter', () => {
  it('lands the pixels either side of 0 on 0', () => {
    expect(snapToCenter(3, 500)).toBe(0)
    expect(snapToCenter(-3, 500)).toBe(0)
  })

  it('leaves values past the snap zone alone', () => {
    expect(snapToCenter(8, 500)).toBe(8)
    expect(snapToCenter(-120, 500)).toBe(-120)
  })

  it('scales with Sway', () => {
    expect(snapToCenter(3, 100)).toBe(3)
    expect(snapToCenter(1, 100)).toBe(0)
  })
})
