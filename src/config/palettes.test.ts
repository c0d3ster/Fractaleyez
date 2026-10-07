import { describe, it, expect } from 'vitest'
import { PALETTES } from './palettes'
import { isHexColor } from './paletteLut'

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

  it('ends a cyclic palette where it starts and leaves a ramp open', () => {
    PALETTES.forEach(({ id, stops, cyclic }) => {
      const closed = stops[0] === stops[stops.length - 1]
      expect(closed, id).toBe(cyclic)
    })
  })
})
