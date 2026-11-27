import { describe, expect, it } from 'vitest'

import { fractalConfig } from '../../config/fractal.config'
import { cAbs, cMul, cSub, complex, type Complex } from './complex'
import { FRACTAL_FAMILIES, getFractalFamily } from './index'
import { fixedPointResult, koenigsPoint, type FixedPointResult } from './koenigs'
import { quadraticFamily } from './quadratic'

const applyStep = (family: (typeof FRACTAL_FAMILIES)[number], z: Complex, c: Complex): Complex => {
  const orbit: [number, number] = [z.re, z.im]
  family.step(orbit, c.re, c.im)
  return complex(orbit[0], orbit[1])
}

const lambdaOf = (fixed: FixedPointResult): Complex =>
  complex(fixed.lambdaMag * Math.cos(fixed.lambdaArg), fixed.lambdaMag * Math.sin(fixed.lambdaArg))

// How far f(K(w)) is from K(lambda w), relative to the size of the step: the error the loop's wrap shows as a pop. The loop starts at a
// view radius of about 0.006, where the third-order coordinate should be far below a pixel.
const conjugacyError = (family: (typeof FRACTAL_FAMILIES)[number], c: Complex, radius: number): number => {
  const fixed = family.fixedPoint(c, null)
  const lambda = lambdaOf(fixed)
  let worst = 0
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2
    const w = complex(radius * Math.cos(angle), radius * Math.sin(angle))
    const mapped = applyStep(family, koenigsPoint(fixed, w), c)
    const expected = koenigsPoint(fixed, cMul(lambda, w))
    worst = Math.max(worst, cAbs(cSub(mapped, expected)) / (radius * fixed.lambdaMag))
  }
  return worst
}

describe('fractal families', () => {
  it('lists as many families as the Type setting allows', () => {
    expect(fractalConfig.family_MAX).toBe(FRACTAL_FAMILIES.length - 1)
  })

  it('falls back to the classic family for unknown values', () => {
    expect(getFractalFamily(-1)).toBe(quadraticFamily)
    expect(getFractalFamily(99)).toBe(quadraticFamily)
    expect(getFractalFamily(0)).toBe(quadraticFamily)
  })

  it('has unique keys and labels', () => {
    expect(new Set(FRACTAL_FAMILIES.map(({ key }) => key)).size).toBe(FRACTAL_FAMILIES.length)
    expect(new Set(FRACTAL_FAMILIES.map(({ label }) => label)).size).toBe(FRACTAL_FAMILIES.length)
  })

  describe.each(FRACTAL_FAMILIES.map((family) => [family.key, family] as const))('%s', (_key, family) => {
    it('zooms on a repelling fixed point of its map at every tour stop', () => {
      family.tour.forEach(([re, im]) => {
        const c = complex(re, im)
        const fixed = family.fixedPoint(c, null)
        const z0 = complex(fixed.fixedPointX, fixed.fixedPointY)
        expect(cAbs(cSub(applyStep(family, z0, c), z0))).toBeLessThan(1e-6)
        expect(fixed.lambdaMag).toBeGreaterThan(1.2)
      })
    })

    it('loops seamlessly: the zoom coordinate turns the map into multiplication', () => {
      family.tour.forEach(([re, im]) => {
        expect(conjugacyError(family, complex(re, im), 0.006)).toBeLessThan(1e-3)
      })
    })

    it('puts every named shape on its own tour stop, at its exact c value', () => {
      family.famousShapes.forEach(({ re, im, tourStop }) => {
        expect(family.tour[tourStop]).toEqual([re, im])
      })
      const stops = family.famousShapes.map(({ tourStop }) => tourStop)
      expect(new Set(stops).size).toBe(stops.length)
    })

    it('keeps its tour and named shapes on the shape pad', () => {
      const { mapView } = family
      const inView = (re: number, im: number): boolean => re >= mapView.reMin && re <= mapView.reMax && im >= mapView.imMin && im <= mapView.imMax
      family.tour.forEach(([re, im]) => expect(inView(re, im)).toBe(true))
      family.famousShapes.forEach(({ re, im }) => expect(inView(re, im)).toBe(true))
    })
  })
})

describe('the classic tour', () => {
  it('keeps every stop strongly repelling so the zoom never crawls', () => {
    quadraticFamily.tour.forEach(([re, im]) => {
      expect(quadraticFamily.fixedPoint(complex(re, im), null).lambdaMag).toBeGreaterThanOrEqual(1.89)
    })
  })
})

describe('fixedPointResult', () => {
  it('matches the classic closed form for z^2 + c (b2 = 1, b3 = 0)', () => {
    const c = complex(-0.7269, 0.1889)
    const classic = quadraticFamily.fixedPoint(c, null)
    const z0 = complex(classic.fixedPointX, classic.fixedPointY)
    const general = fixedPointResult(z0, complex(2 * z0.re, 2 * z0.im), complex(1), complex(0))
    expect(general.koenigs2.re).toBeCloseTo(classic.koenigs2.re, 10)
    expect(general.koenigs2.im).toBeCloseTo(classic.koenigs2.im, 10)
    expect(general.koenigs3.re).toBeCloseTo(classic.koenigs3.re, 10)
    expect(general.koenigs3.im).toBeCloseTo(classic.koenigs3.im, 10)
    expect(general.lambdaArg).toBeCloseTo(classic.lambdaArg, 10)
  })
})
