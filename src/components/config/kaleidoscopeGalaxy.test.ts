import { describe, expect, it } from 'vitest'

import { ColorState } from '../../config/colorState'
import { buildPaletteLut } from '../../config/paletteLut'
import { armOf, ArmStar, colorShiftOffset, dotScaleOf, noise, paletteRgb, starScaleOf, starsPerArm, TAU } from './kaleidoscopeGalaxy'

const LOOK = { dotScale: 1, starScale: 1 }

const angleOf = ({ x, y }: ArmStar): number => Math.atan2(-x, -y)
const radiusOf = ({ x, y }: ArmStar): number => Math.hypot(x, y)

const stateFor = (stops: readonly string[], saturation: number = 1): ColorState => {
  const lut = buildPaletteLut(stops, { reverse: false, hardEdge: true })
  return { key: 'test', saturation, rangeStart: 0, rangeEnd: 1, phase: 0, cycles: 1, lut, baseLut: lut, rangeLut: lut }
}

const luma = ([red, green, blue]: readonly [number, number, number]): number => (0.299 * red + 0.587 * green + 0.114 * blue) / 255

describe('armOf', () => {
  it('draws an odd arm as the exact reflection of the even arm before it', () => {
    const count = 8
    const wedge = TAU / count
    const even = armOf(0, wedge, starsPerArm(count), LOOK, 0)
    const odd = armOf(1, wedge, starsPerArm(count), LOOK, 0)
    expect(odd.stars.length).toBe(even.stars.length)
    even.stars.forEach((star, i) => {
      const mirrored = odd.stars[i]!
      // Reflecting across the boundary between wedge 0 and wedge 1 (at one wedge) keeps the radius and sends angle t to 2 * wedge - t.
      expect(radiusOf(mirrored)).toBeCloseTo(radiusOf(star), 6)
      const expected = 2 * wedge - angleOf(star)
      expect(Math.cos(angleOf(mirrored))).toBeCloseTo(Math.cos(expected), 6)
      expect(Math.sin(angleOf(mirrored))).toBeCloseTo(Math.sin(expected), 6)
    })
  })

  it('curls every plain arm the same way, each with its own scatter', () => {
    const count = 8
    const wedge = TAU / count
    // Which way an arm leans away from the middle of its wedge, read from its outer stars (positive is counterclockwise).
    const lean = (arm: ReturnType<typeof armOf>, index: number): number => {
      const outer = arm.stars.filter(({ along }) => along > 0.7)
      const total = outer.reduce((sum, star) => sum + Math.atan2(Math.sin(angleOf(star) - (index + 0.5) * wedge), Math.cos(angleOf(star) - (index + 0.5) * wedge)), 0)
      return total / outer.length
    }
    const plain = Array.from({ length: 4 }, (_, i) => armOf(i, wedge, starsPerArm(count), LOOK, 0, false))
    const mirrored = Array.from({ length: 4 }, (_, i) => armOf(i, wedge, starsPerArm(count), LOOK, 0, true))
    plain.forEach((arm, i) => expect(lean(arm, i)).toBeGreaterThan(0))
    mirrored.forEach((arm, i) => expect(lean(arm, i) > 0).toBe(i % 2 === 0))
    expect(plain[1]!.stars[0]).not.toEqual(plain[0]!.stars[0])
  })

  it('gives Switcheroo a second shape with the same stars in different places', () => {
    const wedge = TAU / 8
    const first = armOf(0, wedge, 20, LOOK, 0)
    const second = armOf(0, wedge, 20, LOOK, 1)
    expect(second.stars.length).toBe(first.stars.length)
    expect(second.stars[3]).not.toEqual(first.stars[3])
    expect(second.glowInner).not.toBe(first.glowInner)
  })

  it('scales every dot with the look', () => {
    const wedge = TAU / 8
    const small = armOf(0, wedge, 20, { dotScale: 0.5, starScale: 1 }, 0)
    const big = armOf(0, wedge, 20, { dotScale: 1.5, starScale: 1 }, 0)
    expect(big.stars[0]!.radius).toBeGreaterThan(small.stars[0]!.radius)
    expect(big.clouds[0]!.radius).toBeGreaterThan(small.clouds[0]!.radius)
  })
})

describe('sizing', () => {
  it('uses the natural size at the default Scale and Particle size', () => {
    expect(dotScaleOf(1500)).toBeCloseTo(1, 6)
    expect(starScaleOf(10)).toBeCloseTo(1, 6)
  })

  it('keeps extreme settings within a readable range', () => {
    expect(dotScaleOf(100)).toBe(0.45)
    expect(dotScaleOf(2000)).toBeLessThanOrEqual(1.5)
    expect(starScaleOf(1)).toBe(0.6)
    expect(starScaleOf(200)).toBe(1.8)
  })

  it('keeps the star total roughly level as arms are added', () => {
    expect(starsPerArm(2) * 2).toBeGreaterThan(starsPerArm(32) * 32 / 4)
    expect(starsPerArm(32)).toBeGreaterThanOrEqual(6)
    expect(starsPerArm(2)).toBeLessThanOrEqual(40)
  })
})

describe('paletteRgb', () => {
  it('lifts a near-black palette so its stars show on the dark sky', () => {
    const rgb = paletteRgb(stateFor(['#000000', '#ffffff']), 0)
    expect(luma(rgb)).toBeGreaterThanOrEqual(0.49)
  })

  it('leaves a bright color alone at full saturation', () => {
    const rgb = paletteRgb(stateFor(['#ff0000', '#ff0000']), 0.5)
    expect(rgb[0]).toBeGreaterThan(rgb[1])
    expect(rgb[0]).toBeGreaterThan(rgb[2])
  })

  it('desaturates toward gray as Saturation drops', () => {
    const vivid = paletteRgb(stateFor(['#ff0000', '#ff0000'], 1), 0.5)
    const gray = paletteRgb(stateFor(['#ff0000', '#ff0000'], 0), 0.5)
    expect(Math.abs(gray[0] - gray[1])).toBeLessThan(Math.abs(vivid[0] - vivid[1]))
  })
})

describe('noise', () => {
  it('is repeatable and stays in [0, 1)', () => {
    expect(noise(42)).toBe(noise(42))
    Array.from({ length: 200 }, (_, i) => noise(i)).forEach((value) => {
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    })
  })
})

describe('colorShiftOffset', () => {
  it('leaves every arm where it is before the first beat', () => {
    Array.from({ length: 12 }, (_, i) => i).forEach((index) => expect(colorShiftOffset(index, 0)).toBe(0))
  })

  it('moves the arms to new spots on each beat, within one pass of the palette', () => {
    const first = Array.from({ length: 12 }, (_, i) => colorShiftOffset(i, 1))
    const second = Array.from({ length: 12 }, (_, i) => colorShiftOffset(i, 2))
    expect(second).not.toEqual(first)
    first.concat(second).forEach((offset) => {
      expect(offset).toBeGreaterThanOrEqual(0)
      expect(offset).toBeLessThan(1)
    })
  })

  it('does not give every arm the same spot', () => {
    expect(new Set(Array.from({ length: 12 }, (_, i) => colorShiftOffset(i, 1))).size).toBeGreaterThan(6)
  })
})
