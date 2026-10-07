import { describe, it, expect } from 'vitest'
import { arrangeStops, buildPaletteLut, isHexColor, LUT_SIZE, lutToCssGradient, parseHex, sampleLut } from './paletteLut'

const pixel = (lut: Uint8Array, index: number): number[] => Array.from(lut.slice(index * 4, index * 4 + 4))

describe('parseHex', () => {
  it('reads #rrggbb', () => {
    expect(parseHex('#ff8000')).toEqual([1, 128 / 255, 0])
  })

  it('rejects anything else', () => {
    expect(parseHex('red')).toBeNull()
    expect(parseHex('#fff')).toBeNull()
    expect(isHexColor('#12345g')).toBe(false)
  })
})

describe('arrangeStops', () => {
  it('reverses and mirrors back to the first stop', () => {
    expect(arrangeStops(['a', 'b', 'c'], { reverse: false, mirror: false })).toEqual(['a', 'b', 'c'])
    expect(arrangeStops(['a', 'b', 'c'], { reverse: true, mirror: false })).toEqual(['c', 'b', 'a'])
    expect(arrangeStops(['a', 'b', 'c'], { reverse: false, mirror: true })).toEqual(['a', 'b', 'c', 'b', 'a'])
  })
})

describe('buildPaletteLut', () => {
  const shape = { reverse: false, hardEdge: true }

  it('starts at the first stop and heads to the last', () => {
    const lut = buildPaletteLut(['#000000', '#ffffff'], shape)
    expect(pixel(lut, 0)).toEqual([0, 0, 0, 255])
    const end = pixel(lut, LUT_SIZE - 1)
    expect(end[0]).toBeGreaterThan(245)
    expect(lut.length).toBe(LUT_SIZE * 4)
  })

  it('passes through each stop', () => {
    const lut = buildPaletteLut(['#ff0000', '#00ff00', '#0000ff'], shape)
    const middle = pixel(lut, LUT_SIZE / 2)
    expect(middle[1]).toBeGreaterThan(240)
    expect(middle[0]).toBeLessThan(15)
    expect(middle[2]).toBeLessThan(15)
  })

  it('reverses', () => {
    const lut = buildPaletteLut(['#000000', '#ffffff'], { reverse: true, hardEdge: true })
    expect(pixel(lut, 0)).toEqual([255, 255, 255, 255])
  })

  it('plays a one-way ramp out and back by default so it loops', () => {
    const lut = buildPaletteLut(['#000000', '#ffffff'], { reverse: false, hardEdge: false })
    const middle = pixel(lut, LUT_SIZE / 2)
    expect(middle[0]).toBeGreaterThan(245)
    const end = pixel(lut, LUT_SIZE - 1)
    expect(end[0]).toBeLessThan(10)
  })

  it('skips stops that are not colors and survives having none', () => {
    const lut = buildPaletteLut(['nope', '#ffffff', 'also nope'], shape)
    expect(pixel(lut, 5)).toEqual([255, 255, 255, 255])
    expect(pixel(buildPaletteLut([], shape), 3)).toEqual([0, 0, 0, 255])
  })
})

describe('sampleLut', () => {
  const lut = buildPaletteLut(['#000000', '#ffffff'], { reverse: false, hardEdge: true })

  it('reads the start at position 0 and wraps whole turns', () => {
    expect(sampleLut(lut, 0)[0]).toBe(0)
    expect(sampleLut(lut, 3)[0]).toBe(0)
    expect(sampleLut(lut, -1)[0]).toBe(0)
  })

  it('blends between entries', () => {
    const [red] = sampleLut(lut, 0.5)
    expect(red).toBeGreaterThan(0.3)
    expect(red).toBeLessThan(0.5)
  })
})

describe('buildPaletteLut range', () => {
  const ramp = ['#000000', '#ffffff']

  it('crops the palette to the range', () => {
    const lut = buildPaletteLut(ramp, { reverse: false, hardEdge: true, start: 0.5, end: 1 })
    expect(pixel(lut, 0)[0]).toBeGreaterThan(90)
    expect(pixel(lut, 0)[0]).toBeLessThan(140)
    expect(pixel(lut, LUT_SIZE - 1)[0]).toBeGreaterThan(245)
  })

  it('wraps through the seam when the end is before the start', () => {
    const lut = buildPaletteLut(ramp, { reverse: false, hardEdge: true, start: 0.8, end: 0.2 })
    expect(pixel(lut, 0)[0]).toBeGreaterThan(170)
    expect(pixel(lut, 100)[0]).toBeGreaterThan(220)
    expect(pixel(lut, LUT_SIZE - 1)[0]).toBeLessThan(120)
  })

  it('crops a reversed palette as it is drawn', () => {
    // Reversed, the ramp runs white to black, so the first half starts at white and heads toward gray.
    const lut = buildPaletteLut(ramp, { reverse: true, hardEdge: true, start: 0, end: 0.5 })
    expect(pixel(lut, 0)[0]).toBe(255)
    expect(pixel(lut, LUT_SIZE - 1)[0]).toBeGreaterThan(90)
    expect(pixel(lut, LUT_SIZE - 1)[0]).toBeLessThan(150)
  })

  it('plays a cropped range out and back', () => {
    const lut = buildPaletteLut(ramp, { reverse: false, hardEdge: false, start: 0, end: 0.5 })
    expect(pixel(lut, LUT_SIZE / 2)[0]).toBeGreaterThan(90)
    expect(pixel(lut, LUT_SIZE - 1)[0]).toBeLessThan(10)
  })
})

describe('lutToCssGradient', () => {
  it('ends on the last color of a one-way palette instead of wrapping to the first', () => {
    const lut = buildPaletteLut(['#000000', '#ffffff'], { reverse: false, hardEdge: true })
    const stops = lutToCssGradient(lut).match(/rgb\((\d+), \d+, \d+\)/g) ?? []
    expect(stops[0]).toBe('rgb(0, 0, 0)')
    expect(Number(/rgb\((\d+)/.exec(stops[stops.length - 1] ?? '')?.[1])).toBeGreaterThan(245)
  })
})

describe('buildPaletteLut loops', () => {
  const closed = ['#ff0000', '#00ff00', '#0000ff', '#ff0000']
  const gap = (lut: Uint8Array): number =>
    Math.abs((lut[0] ?? 0) - (lut[(LUT_SIZE - 1) * 4] ?? 0)) + Math.abs((lut[1] ?? 0) - (lut[(LUT_SIZE - 1) * 4 + 1] ?? 0))

  it('leaves a palette that already ends where it starts alone', () => {
    expect(buildPaletteLut(closed, { reverse: false, hardEdge: false })).toEqual(buildPaletteLut(closed, { reverse: false, hardEdge: true }))
  })

  it('closes a cropped range of a looping palette', () => {
    const smooth = buildPaletteLut(closed, { reverse: false, hardEdge: false, start: 0, end: 0.5 })
    const hard = buildPaletteLut(closed, { reverse: false, hardEdge: true, start: 0, end: 0.5 })
    expect(gap(smooth)).toBeLessThan(30)
    expect(gap(hard)).toBeGreaterThan(100)
  })

  it('keeps the seam of a one-way ramp with a hard edge', () => {
    const lut = buildPaletteLut(['#000000', '#ffffff'], { reverse: false, hardEdge: true })
    expect(pixel(lut, 0)[0]).toBe(0)
    expect(pixel(lut, LUT_SIZE - 1)[0]).toBeGreaterThan(245)
  })
})
