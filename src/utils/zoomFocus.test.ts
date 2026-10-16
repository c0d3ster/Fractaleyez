import { describe, expect, it } from 'vitest'

import { findZoomFocus, FOCUS_SAMPLE_SIZE } from './zoomFocus'

const SIZE = FOCUS_SAMPLE_SIZE

type Pixel = [number, number, number, number]

const makeImage = (paint: (x: number, y: number) => Pixel): Uint8ClampedArray => {
  const data = new Uint8ClampedArray(SIZE * SIZE * 4)
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) data.set(paint(x, y), (y * SIZE + x) * 4)
  }
  return data
}

const CLEAR: Pixel = [0, 0, 0, 0]

describe('findZoomFocus', () => {
  it('is the center of a blank image', () => {
    expect(findZoomFocus(makeImage(() => CLEAR))).toEqual({ x: 0.5, y: 0.5 })
  })

  it('is the middle of the box around flat, featureless shapes, wherever they sit', () => {
    const bar = makeImage((x, y) => (x >= 40 && x < 140 && y >= 60 && y < 100 ? [30, 30, 30, 255] : CLEAR))
    const focus = findZoomFocus(bar)
    expect(focus.x).toBeCloseTo(90 / SIZE, 2)
    expect(focus.y).toBeCloseTo(80 / SIZE, 2)
  })

  it('uses the bounding box, not the ink, for a lopsided shape', () => {
    // A tall block on the left and a thin bar reaching far right: the box is much wider than the ink's center of mass.
    const shape = makeImage((x, y) => ((x >= 20 && x < 70 && y >= 40 && y < 200) || (x >= 70 && x < 220 && y >= 100 && y < 110) ? [255, 255, 255, 255] : CLEAR))
    const focus = findZoomFocus(shape)
    expect(focus.x).toBeCloseTo(120 / SIZE, 2)
    expect(focus.y).toBeCloseTo(120 / SIZE, 2)
  })

  it('finds the center of nested rings that sit off to one side', () => {
    const [cx, cy] = [165, 100]
    const radii = [100, 70, 48, 32, 20]
    const rings = makeImage((x, y) => {
      const distance = Math.hypot(x - cx, y - cy)
      if (distance > 105) return [20, 20, 20, 255]
      return radii.filter((radius) => distance < radius).length % 2 === 0 ? [240, 200, 40, 255] : [30, 120, 60, 255]
    })
    const focus = findZoomFocus(rings)
    expect(Math.hypot(focus.x - cx / SIZE, focus.y - cy / SIZE)).toBeLessThan(0.05)
  })

  it('finds the glowing core of an off-center blob on a dark background', () => {
    const [cx, cy] = [95, 150]
    const blob = makeImage((x, y) => {
      const level = Math.round(15 + 240 * Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * 22 ** 2)))
      return [level, level, Math.min(255, level + 20), 255]
    })
    const focus = findZoomFocus(blob)
    expect(Math.hypot(focus.x - cx / SIZE, focus.y - cy / SIZE)).toBeLessThan(0.05)
  })

  it('does not chase a bright speck on a flat shape', () => {
    const decoy = makeImage((x, y) => {
      if (x < 30 || x >= 226 || y < 30 || y >= 226) return CLEAR
      return Math.hypot(x - 60, y - 60) < 3 ? [255, 255, 255, 255] : [80, 80, 200, 255]
    })
    const focus = findZoomFocus(decoy)
    expect(Math.hypot(focus.x - 0.5, focus.y - 0.5)).toBeLessThan(0.1)
  })
})
