import { describe, expect, it } from 'vitest'

import { findOpaqueBounds, FULL_BOUNDS } from './opaqueBounds'

const SIZE = 10

const makeImage = (visible: (x: number, y: number) => boolean): Uint8ClampedArray => {
  const data = new Uint8ClampedArray(SIZE * SIZE * 4)
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) data[(y * SIZE + x) * 4 + 3] = visible(x, y) ? 255 : 0
  }
  return data
}

describe('findOpaqueBounds', () => {
  it('boxes the visible pixels', () => {
    const bounds = findOpaqueBounds(makeImage((x, y) => x >= 2 && x <= 7 && y >= 4 && y <= 5), SIZE)
    expect(bounds).toEqual({ left: 0.2, top: 0.4, right: 0.8, bottom: 0.6 })
  })

  it('is the whole frame for a fully visible image', () => {
    expect(findOpaqueBounds(makeImage(() => true), SIZE)).toEqual(FULL_BOUNDS)
  })

  it('is the whole frame for a blank image', () => {
    expect(findOpaqueBounds(makeImage(() => false), SIZE)).toEqual(FULL_BOUNDS)
  })

  it('ignores faint pixels', () => {
    const data = makeImage((x, y) => x === 5 && y === 5)
    data[(1 * SIZE + 1) * 4 + 3] = 10
    expect(findOpaqueBounds(data, SIZE)).toEqual({ left: 0.5, top: 0.5, right: 0.6, bottom: 0.6 })
  })
})
