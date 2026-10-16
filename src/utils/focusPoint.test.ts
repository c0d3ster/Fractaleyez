import { describe, expect, it } from 'vitest'

import { findFocusInRgba } from './focusPoint'

const SIZE = 48

const makeImage = (paint: (x: number, y: number) => [number, number, number, number]): Uint8ClampedArray => {
  const data = new Uint8ClampedArray(SIZE * SIZE * 4)
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) data.set(paint(x, y), (y * SIZE + x) * 4)
  }
  return data
}

describe('findFocusInRgba', () => {
  it('falls back to the center for a blank image', () => {
    expect(findFocusInRgba(makeImage(() => [0, 0, 0, 0]), SIZE)).toEqual({ x: 0.5, y: 0.5 })
  })

  it('falls back to the center for a flat opaque image', () => {
    expect(findFocusInRgba(makeImage(() => [90, 90, 90, 255]), SIZE)).toEqual({ x: 0.5, y: 0.5 })
  })

  it('lands on the detailed spot', () => {
    const checker = (px: number, py: number): [number, number, number, number] => {
      const inDetail = px >= 30 && px < 38 && py >= 8 && py < 16
      const on = inDetail && (px + py) % 2 === 0
      return [on ? 255 : 20, on ? 255 : 20, on ? 255 : 20, 255]
    }
    const { x, y } = findFocusInRgba(makeImage(checker), SIZE)
    expect(x).toBeCloseTo(34 / SIZE, 1)
    expect(y).toBeCloseTo(12 / SIZE, 1)
  })

  it('ignores detail in see-through margins', () => {
    const paint = (x: number, y: number): [number, number, number, number] => {
      if (x < 12) return [(x + y) % 2 === 0 ? 255 : 0, 0, 0, 0] // busy but transparent
      return [(x + y) % 7 === 0 ? 200 : 100, 100, 100, 255]
    }
    expect(findFocusInRgba(makeImage(paint), SIZE).x).toBeGreaterThan(12 / SIZE)
  })
})
