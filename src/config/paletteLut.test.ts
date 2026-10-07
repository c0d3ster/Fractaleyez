import { describe, it, expect } from 'vitest'
import { arrangeStops, buildPaletteLut, isHexColor, LUT_SIZE, parseHex, sampleLut } from './paletteLut'

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
  const shape = { reverse: false, mirror: false }

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
    const lut = buildPaletteLut(['#000000', '#ffffff'], { reverse: true, mirror: false })
    expect(pixel(lut, 0)).toEqual([255, 255, 255, 255])
  })

  it('closes the loop when mirrored', () => {
    const lut = buildPaletteLut(['#000000', '#ffffff'], { reverse: false, mirror: true })
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
  const lut = buildPaletteLut(['#000000', '#ffffff'], { reverse: false, mirror: false })

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
    const lut = buildPaletteLut(ramp, { reverse: false, mirror: false, start: 0.5, end: 1 })
    expect(pixel(lut, 0)[0]).toBeGreaterThan(90)
    expect(pixel(lut, 0)[0]).toBeLessThan(140)
    expect(pixel(lut, LUT_SIZE - 1)[0]).toBeGreaterThan(245)
  })

  it('wraps through the seam when the end is before the start', () => {
    const lut = buildPaletteLut(ramp, { reverse: false, mirror: false, start: 0.8, end: 0.2 })
    expect(pixel(lut, 0)[0]).toBeGreaterThan(170)
    expect(pixel(lut, 100)[0]).toBeGreaterThan(220)
    expect(pixel(lut, LUT_SIZE - 1)[0]).toBeLessThan(120)
  })

  it('mirrors the cropped range', () => {
    const lut = buildPaletteLut(ramp, { reverse: false, mirror: true, start: 0, end: 0.5 })
    expect(pixel(lut, LUT_SIZE / 2)[0]).toBeGreaterThan(90)
    expect(pixel(lut, LUT_SIZE - 1)[0]).toBeLessThan(10)
  })
})
