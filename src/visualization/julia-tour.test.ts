import { describe, expect, it } from 'vitest'

import { JULIA_FAMOUS_SHAPES, JULIA_TOUR } from './julia-tour'

// The repelling fixed point's multiplier for z^2 + c: |2z| at the larger root of z^2 - z + c = 0.
const repellingMultiplier = (re: number, im: number): number => {
  const dRe = 1 - 4 * re
  const dIm = -4 * im
  const dMag = Math.hypot(dRe, dIm)
  const sqrtRe = Math.sqrt(Math.max(0, (dMag + dRe) / 2))
  const sqrtIm = Math.sign(dIm) * Math.sqrt(Math.max(0, (dMag - dRe) / 2))
  return Math.max(Math.hypot(1 + sqrtRe, sqrtIm), Math.hypot(1 - sqrtRe, -sqrtIm))
}

describe('JULIA_FAMOUS_SHAPES', () => {
  it('puts every named shape on a tour stop at its exact c value', () => {
    JULIA_FAMOUS_SHAPES.forEach(({ re, im, tourStop }) => {
      expect(JULIA_TOUR[tourStop]).toEqual([re, im])
    })
  })

  it('uses a different stop for each named shape', () => {
    const stops = JULIA_FAMOUS_SHAPES.map(({ tourStop }) => tourStop)
    expect(new Set(stops).size).toBe(stops.length)
  })
})

describe('JULIA_TOUR', () => {
  it('keeps every stop strongly repelling so the zoom never crawls', () => {
    JULIA_TOUR.forEach(([re, im]) => {
      expect(repellingMultiplier(re, im)).toBeGreaterThanOrEqual(1.89)
    })
  })
})
