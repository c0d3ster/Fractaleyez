import { describe, it, expect } from 'vitest'
import { PALETTE_BY_ID, PALETTES } from './palettes'
import { buildPaletteLut, isHexColor } from './paletteLut'

describe('PALETTES', () => {
  it('only uses valid hex stops and has at least two of them', () => {
    PALETTES.forEach(({ stops }) => {
      expect(stops.length).toBeGreaterThanOrEqual(2)
      stops.forEach((stop) => expect(isHexColor(stop)).toBe(true))
    })
  })

  it('has unique ids', () => {
    expect(new Set(PALETTES.map(({ id }) => id)).size).toBe(PALETTES.length)
  })
})

describe('rainbow', () => {
  it('has no sharp bends in its gradient (they show as hard lines in the fractal)', () => {
    const lut = buildPaletteLut(PALETTE_BY_ID.rainbow?.stops ?? [], { reverse: false, hardEdge: true })
    const size = lut.length / 4
    const channel = (index: number, offset: number): number => lut[(((index % size) + size) % size) * 4 + offset] ?? 0
    for (let i = 0; i < size; i++) {
      const bend = [0, 1, 2].map((offset) => channel(i, offset) - 2 * channel(i + 1, offset) + channel(i + 2, offset))
      // Rounding to whole bytes alone gives bends of a few units; a clipped primary gave 10 to 30.
      expect(Math.hypot(...bend)).toBeLessThan(5)
    }
  })
})
