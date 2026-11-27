import { cAbs, cPow, cScale, complex, type Complex } from './complex'
import type { FamousShape, FractalFamily, MapView } from './family'
import { fixedPointResult, pickFixedPoint, type FixedPointResult } from './koenigs'
import { polynomialRoots } from './polynomial-roots'

// A repelling fixed point weaker than this is skipped when there is a choice: the zoom would crawl.
const MIN_REPELLING = 1.05
const ESCAPE_RADIUS_SQUARED = 256

const binomial = (n: number, k: number): number => {
  let result = 1
  for (let i = 1; i <= k; i++) result = (result * (n - k + i)) / i
  return result
}

type MultibrotOptions = {
  degree: number
  /** The map uses i c instead of c: turns the parameter plane a quarter turn (the Julia sets only turn), so a tall map fits the wide pad. */
  rotateParameter: boolean
  key: string
  label: string
  description: string
  tour: readonly (readonly [number, number])[]
  famousShapes: readonly FamousShape[]
  mapView: MapView
  wholeSetRadius: number
  parameterScale: number
  /** Measured like the classic family's 0.2: the radius where the wrap error reaches the same size. */
  seamSafeRadius: number
}

/**
 * z^d + c for d of 3 and up: the Julia sets have d-fold symmetry and the shape pad shows the degree-d Multibrot set. The fixed points
 * solve z^d - z + c = 0 (no closed form past d = 2), and the multiplier there is d z^(d - 1).
 */
const multibrotFamily = ({ degree, rotateParameter, ...family }: MultibrotOptions): FractalFamily => {
  const parameter = (c: Complex): Complex => (rotateParameter ? complex(-c.im, c.re) : c)
  const multiplier = (z: Complex): Complex => cScale(cPow(z, degree - 1), degree)

  const fixedPoint = (c: Complex, previous: Complex | null): FixedPointResult => {
    // z^d - z + a, highest power first.
    const coefficients = Array.from({ length: degree + 1 }, (_, index): Complex => {
      if (index === 0) return complex(1)
      if (index === degree - 1) return complex(-1)
      return index === degree ? parameter(c) : complex(0)
    })
    const roots = polynomialRoots(coefficients)
    const repelling = roots.filter((root) => cAbs(multiplier(root)) > MIN_REPELLING)
    const z0 = pickFixedPoint(repelling, previous, (root) => cAbs(multiplier(root)))
      ?? roots.reduce((best, root) => (cAbs(multiplier(root)) > cAbs(multiplier(best)) ? root : best))
    // f(z0 + u) = z0 + lambda u + C(d,2) z0^(d-2) u^2 + C(d,3) z0^(d-3) u^3 + ...
    return fixedPointResult(z0, multiplier(z0), cScale(cPow(z0, degree - 2), binomial(degree, 2)), cScale(cPow(z0, degree - 3), binomial(degree, 3)))
  }

  // The critical point is 0, so the parameter plane maps where 0's orbit goes.
  const criticalOrbit = (c: Complex, maxIterations: number, escapeSquared: number): { escaped: boolean; n: number; z: Complex } => {
    const a = parameter(c)
    let z = complex(0)
    for (let n = 0; n < maxIterations; n++) {
      const power = cPow(z, degree)
      z = { re: power.re + a.re, im: power.im + a.im }
      if (z.re * z.re + z.im * z.im > escapeSquared) return { escaped: true, n, z }
    }
    return { escaped: false, n: maxIterations, z }
  }

  // z^d by repeated multiplication, which the GLSL compiler unrolls.
  const powerGlsl = Array.from({ length: degree - 1 }).reduce<string>((power) => `complexMul(${power}, z)`, 'z')

  return {
    ...family,
    wholeSetCenter: complex(0),
    referenceMultiplier: 2.8,
    fixedPoint,
    step: (z, cRe, cIm) => {
      const aRe = rotateParameter ? -cIm : cRe
      const aIm = rotateParameter ? cRe : cIm
      let re = z[0]
      let im = z[1]
      for (let i = 1; i < degree; i++) {
        const nextRe = re * z[0] - im * z[1]
        im = re * z[1] + im * z[0]
        re = nextRe
      }
      z[0] = re + aRe
      z[1] = im + aIm
    },
    escaped: (zRe, zIm) => zRe * zRe + zIm * zIm > ESCAPE_RADIUS_SQUARED,
    parameterInSet: (c) => !criticalOrbit(c, 200, 4).escaped,
    mapIterations: (c, maxIterations) => {
      const { escaped, n, z } = criticalOrbit(c, maxIterations, ESCAPE_RADIUS_SQUARED)
      return escaped ? n + 1 - Math.log(Math.log(z.re * z.re + z.im * z.im) * 0.5) / Math.log(degree) : -1
    },
    glsl: {
      step: `return ${powerGlsl} + ${rotateParameter ? 'vec2(-c.y, c.x)' : 'c'};`,
      escaped: 'return dot(z, z) > 256.0;',
      smooth: `float logZn = log(dot(z, z)) * 0.5; return n + 1.0 - log(logZn) / log(${degree}.0);`,
    },
  }
}

// Tours traced offline just inside each Multibrot set's boundary and resampled evenly (like the classic tour), so almost every stop is a
// connected, detailed shape. Each covers one symmetric slice of the set, since the rest repeat it turned or mirrored.

// The cubic set, turned a quarter (see rotateParameter). Every stop's fixed point has a multiplier of at least 4.
const CUBIC_TOUR: readonly (readonly [number, number])[] = [
  [1.0734, 0.0001], [1.1147, 0.0563], [1.1052, 0.1185], [1.1084, 0.1789],
  [1.1665, 0.2231], [1.099, 0.2339], [1.0762, 0.2392], [0.9586, 0.2221],
  [0.9296, 0.225], [0.7593, 0.1921], [0.7327, 0.2104], [0.7283, 0.2471],
  [0.6845, 0.2973], [0.7029, 0.3519], [0.6326, 0.3706], [0.5944, 0.4125],
  [0.5553, 0.4479], [0.6098, 0.5193], [0.5916, 0.5691], [0.5302, 0.6044],
  [0.4753, 0.621], [0.3912, 0.5292], [0.3516, 0.5376], [0.3016, 0.5607],
  [0.272, 0.596], [0.2092, 0.5489], [0.165, 0.5495], [0.1156, 0.5115],
  [0.0639, 0.4808], [0.0171, 0.4263], [-0.0171, 0.4263], [-0.0639, 0.4808],
  [-0.1156, 0.5115], [-0.165, 0.5495], [-0.2092, 0.5489], [-0.272, 0.596],
  [-0.3016, 0.5607], [-0.3516, 0.5376], [-0.3912, 0.5292], [-0.4753, 0.621],
  [-0.5302, 0.6044], [-0.5916, 0.5691], [-0.6098, 0.5193], [-0.5553, 0.4479],
  [-0.5944, 0.4125], [-0.6326, 0.3706], [-0.7029, 0.3519], [-0.6845, 0.2973],
  [-0.7283, 0.2471], [-0.7327, 0.2104], [-0.7593, 0.1921], [-0.9296, 0.225],
  [-0.9586, 0.2221], [-1.0762, 0.2392], [-1.099, 0.2339], [-1.1665, 0.2231],
  [-1.1084, 0.1789], [-1.1052, 0.1185], [-1.1147, 0.0563], [-1.0734, 0.0001],
]

// The quartic set. Every stop's fixed point has a multiplier of at least 5.
const QUARTIC_TOUR: readonly (readonly [number, number])[] = [
  [0.6071, 0.0864], [0.6124, 0.1255], [0.6618, 0.1531], [0.653, 0.1974],
  [0.6368, 0.2259], [0.6548, 0.2455], [0.7174, 0.2934], [0.7399, 0.3433],
  [0.7258, 0.3781], [0.7167, 0.429], [0.6711, 0.4285], [0.614, 0.4076],
  [0.5975, 0.4576], [0.6087, 0.512], [0.5623, 0.5255], [0.5538, 0.5687],
  [0.5502, 0.5765], [0.5451, 0.5758], [0.5437, 0.5783], [0.5489, 0.5873],
  [0.6978, 0.7534], [0.6909, 0.769], [0.6516, 0.7876], [0.634, 0.8305],
  [0.5957, 0.8671], [0.5896, 0.9205], [0.5797, 0.9734], [0.5532, 0.9887],
  [0.5024, 0.9709], [0.453, 0.9495], [0.4022, 0.9643], [0.3563, 0.9581],
  [0.3206, 0.9829], [0.3036, 0.981], [0.2342, 0.769], [0.229, 0.76],
  [0.2261, 0.76], [0.2241, 0.7647], [0.2156, 0.764], [0.1739, 0.7497],
  [0.1391, 0.7831], [0.0976, 0.7462], [0.046, 0.7356], [0.0355, 0.7954],
  [0.0132, 0.8352], [-0.0354, 0.8176], [-0.0726, 0.8124], [-0.1046, 0.768],
  [-0.1148, 0.6898], [-0.1227, 0.6644], [-0.1555, 0.6642], [-0.1983, 0.6497],
  [-0.1975, 0.5932], [-0.2287, 0.569], [-0.24, 0.5169], [-0.243, 0.4601],
  [-0.2331, 0.4039],
]

export const cubicFamily = multibrotFamily({
  degree: 3,
  rotateParameter: true,
  key: 'cubic',
  label: 'Triad',
  description: 'z cubed: three-fold Julia sets, from trefoils to pinwheels and lightning.',
  tour: CUBIC_TOUR,
  famousShapes: [
    { name: 'Trefoil', re: 1.0734, im: 0.0001, tourStop: 0 },
    { name: 'Clover', re: 0.7327, im: 0.2104, tourStop: 10 },
    { name: 'Pinwheel', re: -0.0171, im: 0.4263, tourStop: 30 },
    { name: 'Starburst', re: -0.272, im: 0.596, tourStop: 35 },
    { name: 'Lightning', re: -1.1665, im: 0.2231, tourStop: 55 },
  ],
  mapView: { reMin: -1.45, reMax: 1.45, imMin: -0.97, imMax: 0.97 },
  wholeSetRadius: 1.5,
  parameterScale: 1,
  seamSafeRadius: 0.18,
})

export const quarticFamily = multibrotFamily({
  degree: 4,
  rotateParameter: false,
  key: 'quartic',
  label: 'Quad',
  description: 'z to the fourth: four-fold Julia sets, crosses, snowflakes and vortices.',
  tour: QUARTIC_TOUR,
  famousShapes: [
    { name: 'Snowflake', re: 0.7399, im: 0.3433, tourStop: 7 },
    { name: 'Vortex', re: 0.5451, im: 0.5758, tourStop: 17 },
    { name: 'Cross', re: 0.6516, im: 0.7876, tourStop: 22 },
    { name: 'Island', re: 0.046, im: 0.7356, tourStop: 42 },
    { name: 'Star', re: -0.1975, im: 0.5932, tourStop: 52 },
  ],
  mapView: { reMin: -1.9, reMax: 1.45, imMin: -1.117, imMax: 1.117 },
  wholeSetRadius: 1.45,
  parameterScale: 1.1,
  seamSafeRadius: 0.12,
})
