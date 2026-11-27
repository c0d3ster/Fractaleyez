import { cAbs, cDiv, cMul, cSub, complex, type Complex } from './complex'
import type { FractalFamily } from './family'
import { fixedPointResult, pickFixedPoint, type FixedPointResult } from './koenigs'

// A point escapes once its imaginary part passes this: sin grows like e^|Im z| / 2 off the real axis.
const ESCAPE_IMAGINARY = 50
const LOG_ESCAPE = Math.log(ESCAPE_IMAGINARY)
// sin's growth off the real axis overflows past this; every escaping orbit has left long before.
const IMAGINARY_CLAMP = 60
const MIN_REPELLING = 1.05
// Fixed points with a multiplier under this zoom very slowly, so a fresh pick prefers the one nearest the middle past it.
const PREFERRED_MULTIPLIER = 1.3
const NEWTON_STEPS = 60
// sin z = z / c has fixed points along the whole real axis, about one per half period; Newton from these finds the ones near the middle.
const SEEDS: readonly Complex[] = [
  complex(0),
  ...Array.from({ length: 13 }, (_, i) => i - 6).flatMap((re) => [-1.5, -0.5, 0.5, 1.5].map((im) => complex(re, im))),
]

const cSin = ({ re, im }: Complex): Complex => {
  const y = Math.max(-IMAGINARY_CLAMP, Math.min(IMAGINARY_CLAMP, im))
  return complex(Math.sin(re) * Math.cosh(y), Math.cos(re) * Math.sinh(y))
}

const cCos = ({ re, im }: Complex): Complex => {
  const y = Math.max(-IMAGINARY_CLAMP, Math.min(IMAGINARY_CLAMP, im))
  return complex(Math.cos(re) * Math.cosh(y), -Math.sin(re) * Math.sinh(y))
}

// Newton's method on g(z) = c sin z - z, steps capped at length 1 so a far seed cannot fly off.
const polishFixedPoint = (c: Complex, seed: Complex): Complex | null => {
  let z = seed
  for (let i = 0; i < NEWTON_STEPS; i++) {
    const slope = cSub(cMul(c, cCos(z)), complex(1))
    if (cAbs(slope) < 1e-14) return null
    const newton = cDiv(cSub(cMul(c, cSin(z)), z), slope)
    const length = cAbs(newton)
    z = cSub(z, length > 1 ? complex(newton.re / length, newton.im / length) : newton)
    if (length < 1e-13) break
  }
  return cAbs(cSub(cMul(c, cSin(z)), z)) < 1e-9 ? z : null
}

/**
 * The fixed points solve c sin z = z (0 is always one). The multiplier there is c cos z, and the next derivatives are -c sin z = -z and
 * -c cos z = -lambda, so b2 = -z / 2 and b3 = -lambda / 6.
 */
const fixedPoint = (c: Complex, previous: Complex | null): FixedPointResult => {
  const roots = [...(previous ? [previous] : []), ...SEEDS]
    .map((seed) => polishFixedPoint(c, seed))
    .filter((root): root is Complex => root !== null)
  const multiplier = (z: Complex): number => cAbs(cMul(c, cCos(z)))
  const repelling = roots.filter((root) => multiplier(root) > MIN_REPELLING)
  const preference = (z: Complex): number => (multiplier(z) >= PREFERRED_MULTIPLIER ? -cAbs(z) : cAbs(z) - 1000)
  const z0 = pickFixedPoint(repelling, previous, preference) ?? previous ?? complex(0)
  const lambda = cMul(c, cCos(z0))
  return fixedPointResult(z0, lambda, complex(-z0.re / 2, -z0.im / 2), complex(-lambda.re / 6, -lambda.im / 6))
}

const step = (z: [number, number], cRe: number, cIm: number): void => {
  const y = Math.max(-IMAGINARY_CLAMP, Math.min(IMAGINARY_CLAMP, z[1]))
  const sinRe = Math.sin(z[0]) * Math.cosh(y)
  const sinIm = Math.cos(z[0]) * Math.sinh(y)
  z[0] = cRe * sinRe - cIm * sinIm
  z[1] = cRe * sinIm + cIm * sinRe
}

// sin's critical points (pi/2 + k pi) all land on +-c, whose orbits mirror each other: one orbit maps the parameter plane.
const criticalOrbit = (c: Complex, maxIterations: number): { escaped: boolean; n: number; im: number } => {
  const z: [number, number] = [c.re, c.im]
  for (let n = 0; n < maxIterations; n++) {
    step(z, c.re, c.im)
    if (Math.abs(z[1]) > ESCAPE_IMAGINARY) return { escaped: true, n, im: Math.abs(z[1]) }
  }
  return { escaped: false, n: maxIterations, im: 0 }
}

// Like the exponential family: the step before escaping had |Im z| between about log 50 and 50, and the escaping one is about e to that,
// so the double log spreads one iteration's worth of color smoothly.
const smoothCount = (n: number, im: number): number =>
  n + 1 - Math.max(0, Math.min(1, Math.log(Math.log(im) / LOG_ESCAPE) / Math.log(ESCAPE_IMAGINARY / LOG_ESCAPE)))

// Just inside the edge of the central disk of the parameter plane (where 0 attracts), from the ferns on the right over the top to the
// spirals on the left. The zoom stays on the fixed point nearest the middle; its multiplier runs from 1.5 to 4.5.
const TOUR: readonly (readonly [number, number])[] = [
  [0.8661, 0.4731], [0.8446, 0.542], [0.8251, 0.6144], [0.7537, 0.6471],
  [0.7536, 0.7318], [0.6872, 0.7298], [0.6229, 0.7906], [0.5413, 0.8313],
  [0.5739, 0.9278], [0.5378, 0.9687], [0.4663, 0.8867], [0.3839, 0.932],
  [0.3263, 0.9872], [0.2567, 0.966], [0.1838, 0.976], [0.0957, 0.9884],
  [0.0459, 1.0507], [0.0449, 1.1644], [0.0157, 1.2554], [-0.0443, 1.2342],
  [-0.0453, 1.1204], [-0.0463, 1.0067], [-0.1311, 0.981], [-0.22, 0.9916],
  [-0.2904, 0.9515], [-0.3379, 0.9314], [-0.4218, 0.8959], [-0.4984, 0.9337],
  [-0.5778, 0.9829], [-0.5517, 0.8814], [-0.5842, 0.8192], [-0.6346, 0.761],
  [-0.7204, 0.7539], [-0.7341, 0.7041], [-0.772, 0.6286], [-0.8325, 0.5875],
  [-0.8632, 0.5161], [-0.8977, 0.4437], [-0.9205, 0.3629], [-0.9463, 0.2927],
]

/** The sine family, c sin z: a band of ferns and spiral flowers that repeats left and right forever. */
export const sineFamily: FractalFamily = {
  key: 'sine',
  label: 'Ribbon',
  mathName: 'Sine family',
  formula: 'c·sin z',
  description: 'A band of ferns and spiral flowers, repeating left and right forever.',
  tour: TOUR,
  famousShapes: [
    { name: 'Ferns', re: 0.8661, im: 0.4731, tourStop: 0 },
    { name: 'Flowers', re: 0.4663, im: 0.8867, tourStop: 10 },
    { name: 'Lanterns', re: -0.0453, im: 1.1204, tourStop: 20 },
    { name: 'Pinwheels', re: -0.5842, im: 0.8192, tourStop: 30 },
    { name: 'Spirals', re: -0.8325, im: 0.5875, tourStop: 35 },
  ],
  mapView: { reMin: -2.4, reMax: 2.4, imMin: -1.6, imMax: 1.6 },
  wholeSetRadius: 4,
  parameterScale: 1,
  wholeSetCenter: complex(0),
  // Where the wrap error matches the classic family's at 0.2.
  seamSafeRadius: 0.14,
  referenceMultiplier: 2.8,
  fixedPoint,
  step,
  escaped: (_zRe, zIm) => Math.abs(zIm) > ESCAPE_IMAGINARY,
  parameterInSet: (c) => !criticalOrbit(c, 150).escaped,
  mapIterations: (c, maxIterations) => {
    const { escaped, n, im } = criticalOrbit(c, maxIterations)
    return escaped ? smoothCount(n, im) : -1
  },
  glsl: {
    // GLSL ES 1.0 has no sinh or cosh, so they come from exp.
    step: `float y = clamp(z.y, -${IMAGINARY_CLAMP}.0, ${IMAGINARY_CLAMP}.0);
    float ey = exp(y);
    float eny = 1.0 / ey;
    vec2 s = vec2(sin(z.x) * 0.5 * (ey + eny), cos(z.x) * 0.5 * (ey - eny));
    return complexMul(c, s);`,
    escaped: `return abs(z.y) > ${ESCAPE_IMAGINARY}.0;`,
    smooth: `return n + 1.0 - clamp(log(log(abs(z.y)) / ${LOG_ESCAPE}) / ${Math.log(ESCAPE_IMAGINARY / LOG_ESCAPE)}, 0.0, 1.0);`,
  },
}
