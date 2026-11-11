import { describe, expect, it } from 'vitest'
import { stripEdgeBackground } from '../src/strip-background'

type FakeCanvasContext = Pick<CanvasRenderingContext2D, 'getImageData' | 'putImageData'>

const createFakeCtx = (data: Uint8ClampedArray): FakeCanvasContext => {
  let current = data
  return {
    getImageData: (_x: number, _y: number, w: number, h: number) => {
      return { data: current, width: w, height: h, colorSpace: 'srgb' } as ImageData
    },
    putImageData: (imageData: ImageData) => {
      current = imageData.data as Uint8ClampedArray
    },
  } as FakeCanvasContext
}

// Builds a square RGBA buffer from a grid of single-char pixel codes.
// 'n' = neutral background (white), 'r' = red foreground, 'k' = black foreground,
// '.' = transparent.
const buildGrid = (rows: string[]): { data: Uint8ClampedArray; size: number } => {
  const size = rows.length
  const data = new Uint8ClampedArray(size * size * 4)
  rows.forEach((row, y) => {
    row.split('').forEach((code, x) => {
      const p = (y * size + x) * 4
      if (code === 'n') {
        data[p] = 255
        data[p + 1] = 255
        data[p + 2] = 255
        data[p + 3] = 255
      } else if (code === 'r') {
        data[p] = 200
        data[p + 1] = 20
        data[p + 2] = 20
        data[p + 3] = 255
      } else if (code === 'k') {
        data[p] = 10
        data[p + 1] = 10
        data[p + 2] = 10
        data[p + 3] = 255
      } else {
        data[p] = 0
        data[p + 1] = 0
        data[p + 2] = 0
        data[p + 3] = 0
      }
    })
  })
  return { data, size }
}

const alphaAt = (data: Uint8ClampedArray, size: number, x: number, y: number): number => {
  return data[(y * size + x) * 4 + 3] ?? -1
}

describe('stripEdgeBackground', () => {
  it('strips a solid neutral border, leaving the colored subject opaque', () => {
    const rows = ['nnnnn', 'nrrrn', 'nrrrn', 'nrrrn', 'nnnnn']
    const { data, size } = buildGrid(rows)
    const ctx = createFakeCtx(data)
    // falloffRadiusPx disabled: this grid is too small for the feather ramp to reach
    // a clean 0 at the corner, and feathering isn't what this test is checking.
    stripEdgeBackground(ctx as CanvasRenderingContext2D, size, size, { minStripAreaFraction: 0, falloffRadiusPx: 0 })
    expect(alphaAt(data, size, 0, 0)).toBe(0)
    expect(alphaAt(data, size, 2, 2)).toBe(255)
  })

  it('leaves a colored (non-neutral) background untouched', () => {
    const rows = ['rrrrr', 'rkkkr', 'rkkkr', 'rkkkr', 'rrrrr']
    const { data, size } = buildGrid(rows)
    const before = data.slice()
    const ctx = createFakeCtx(data)
    stripEdgeBackground(ctx as CanvasRenderingContext2D, size, size, { minStripAreaFraction: 0 })
    expect(data).toEqual(before)
  })

  it('removes a fully-enclosed background-colored hole in flat line art', () => {
    // A white background margin touches the canvas edge (so it seeds the border flood
    // fill and the learned bg-average color), a black ink ring one pixel in blocks the
    // flood fill from reaching the center by adjacency, and the white 3x3 hole in the
    // middle never touches the edge — only the flat-image interior-seeding pass can
    // remove it.
    const rows = [
      'nnnnnnn',
      'nkkkkkn',
      'nknnnkn',
      'nknnnkn',
      'nknnnkn',
      'nkkkkkn',
      'nnnnnnn',
    ]
    const { data, size } = buildGrid(rows)
    const ctx = createFakeCtx(data)
    stripEdgeBackground(ctx as CanvasRenderingContext2D, size, size, { minStripAreaFraction: 0, falloffRadiusPx: 0 })
    expect(alphaAt(data, size, 3, 3)).toBe(0)
    expect(alphaAt(data, size, 1, 1)).toBe(255)
  })

  it('abandons the strip when the resulting area is below minStripAreaFraction', () => {
    const rows = ['nrrrr', 'rrrrr', 'rrrrr', 'rrrrr', 'rrrrr']
    const { data, size } = buildGrid(rows)
    const before = data.slice()
    const ctx = createFakeCtx(data)
    stripEdgeBackground(ctx as CanvasRenderingContext2D, size, size, { minStripAreaFraction: 0.5 })
    expect(data).toEqual(before)
  })

  it('keeps a default when the option is passed as undefined', () => {
    const rows = ['nnnnn', 'nrrrn', 'nrrrn', 'nrrrn', 'nnnnn']
    const { data, size } = buildGrid(rows)
    const ctx = createFakeCtx(data)
    stripEdgeBackground(ctx as CanvasRenderingContext2D, size, size, {
      minStripAreaFraction: 0,
      falloffRadiusPx: 0,
      interiorBackgroundMatchTolerance: undefined,
    })
    expect(alphaAt(data, size, 0, 0)).toBe(0)
    expect(alphaAt(data, size, 2, 2)).toBe(255)
  })

  it('keeps black foreground that touches transparent square padding', () => {
    // A 5x3 image as prepareSprite pads it to a square: one transparent row above and below. The black pixels sit right under the
    // padding, whose RGB (0,0,0) is within a step of theirs, so they must not be read as background through it.
    const rows = ['.....', 'nkkkn', 'nkkkn', 'nnnnn', '.....']
    const { data, size } = buildGrid(rows)
    const ctx = createFakeCtx(data)
    stripEdgeBackground(ctx as CanvasRenderingContext2D, size, size, { minStripAreaFraction: 0, falloffRadiusPx: 0 })
    for (let x = 1; x <= 3; x++) {
      expect(alphaAt(data, size, x, 1)).toBe(255)
      expect(alphaAt(data, size, x, 2)).toBe(255)
    }
    expect(alphaAt(data, size, 0, 1)).toBe(0)
    expect(alphaAt(data, size, 2, 3)).toBe(0)
  })
})
