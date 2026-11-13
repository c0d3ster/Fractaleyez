import { describe, expect, it } from 'vitest'

import { fillFromEdges } from './edge-fill'

type Pixel = [number, number, number, number]

const CLEAR: Pixel = [0, 0, 0, 0]
const GRAY: Pixel = [128, 128, 128, 255]
const RED: Pixel = [255, 0, 0, 255]
const BLUE: Pixel = [0, 0, 255, 255]

const image = (rows: Pixel[][]): { data: Uint8ClampedArray; width: number; height: number } => {
  const height = rows.length
  const width = rows[0]?.length ?? 0
  return { data: new Uint8ClampedArray(rows.flat(2)), width, height }
}

const pixelAt = (data: Uint8ClampedArray, width: number, x: number, y: number): number[] =>
  Array.from(data.slice((y * width + x) * 4, (y * width + x) * 4 + 4))

describe('fillFromEdges', () => {
  it('colors the inside of a shape with its edge color, like a gray ring around a red middle', () => {
    const { data, width, height } = image([
      [CLEAR, CLEAR, CLEAR, CLEAR, CLEAR],
      [CLEAR, GRAY, GRAY, GRAY, CLEAR],
      [CLEAR, GRAY, RED, GRAY, CLEAR],
      [CLEAR, GRAY, GRAY, GRAY, CLEAR],
      [CLEAR, CLEAR, CLEAR, CLEAR, CLEAR],
    ])
    const out = fillFromEdges(data, width, height, 128)
    expect(pixelAt(out, width, 2, 2)).toEqual(GRAY)
    expect(pixelAt(out, width, 1, 1)).toEqual(GRAY)
  })

  it('keeps the alpha, so the cut-out outline and the clear pixels do not change', () => {
    const { data, width, height } = image([
      [CLEAR, GRAY, CLEAR],
      [GRAY, RED, GRAY],
      [CLEAR, GRAY, CLEAR],
    ])
    const out = fillFromEdges(data, width, height, 128)
    expect(pixelAt(out, width, 0, 0)).toEqual(CLEAR)
    for (let i = 3; i < out.length; i += 4) expect(out[i]).toBe(data[i])
  })

  it('takes each pixel from the nearest edge', () => {
    // A solid strip, blue on its left end and red on its right, five wide: the middle three are inside (rows above and below are clear).
    const row: Pixel[] = [BLUE, RED, RED, RED, RED, RED, RED]
    const { data, width, height } = image([
      [CLEAR, CLEAR, CLEAR, CLEAR, CLEAR, CLEAR, CLEAR],
      row,
      [CLEAR, CLEAR, CLEAR, CLEAR, CLEAR, CLEAR, CLEAR],
    ])
    const out = fillFromEdges(data, width, height, 128)
    // Every pixel of a one-pixel-high strip touches clear pixels, so each is its own edge and keeps its color.
    expect(pixelAt(out, width, 0, 1)).toEqual(BLUE)
    expect(pixelAt(out, width, 3, 1)).toEqual(RED)
  })

  it('treats the image border as an edge for a fully solid image', () => {
    const { data, width, height } = image([
      [GRAY, GRAY, GRAY],
      [GRAY, RED, GRAY],
      [GRAY, GRAY, GRAY],
    ])
    expect(pixelAt(fillFromEdges(data, width, height, 128), width, 1, 1)).toEqual(GRAY)
  })

  it('counts a pixel under the cutoff as clear', () => {
    const faint: Pixel = [255, 255, 255, 60]
    const { data, width, height } = image([
      [faint, faint, faint, faint, faint],
      [faint, GRAY, GRAY, GRAY, faint],
      [faint, GRAY, RED, GRAY, faint],
      [faint, GRAY, GRAY, GRAY, faint],
      [faint, faint, faint, faint, faint],
    ])
    const out = fillFromEdges(data, width, height, 128)
    expect(pixelAt(out, width, 2, 2)).toEqual(GRAY)
    expect(pixelAt(out, width, 0, 0)).toEqual(faint)
  })
})
