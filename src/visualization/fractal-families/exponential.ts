import { cAbs, cDiv, cExp, cMul, cSub, complex, type Complex } from './complex'
import type { FractalFamily } from './family'
import { fixedPointResult, pickFixedPoint, type FixedPointResult } from './koenigs'

// A point escapes once its real part passes this: the next step multiplies by e^50.
const ESCAPE_REAL = 50
// The step before escaping had a real part between about log(ESCAPE_REAL) and ESCAPE_REAL, and the escaping real part is about e to that.
// The smooth count spreads the log of that earlier real part over one iteration (0 just past the escape line, 1 at its top), so the colors
// run on smoothly instead of banding; a single log would bunch almost every point at the start of the band.
const LOG_ESCAPE = Math.log(ESCAPE_REAL)
const MIN_REPELLING = 1.05
// Fixed points with a multiplier under this zoom very slowly, so a fresh pick prefers the nearest one past it.
const PREFERRED_MULTIPLIER = 1.3
const NEWTON_STEPS = 40
const BRANCHES = [-3, -2, -1, 0, 1, 2, 3]

const cLog = (z: Complex): Complex => complex(Math.log(cAbs(z)), Math.atan2(z.im, z.re))

// Newton's method on g(z) = c e^z - z, whose roots are the fixed points. Steps are capped at length 1 so a far seed cannot fly off.
const polishFixedPoint = (c: Complex, seed: Complex): Complex | null => {
  let z = seed
  for (let i = 0; i < NEWTON_STEPS; i++) {
    const image = cMul(c, cExp(z))
    const slope = cSub(image, complex(1))
    if (cAbs(slope) < 1e-14) return null
    const newton = cDiv(cSub(image, z), slope)
    const length = cAbs(newton)
    z = cSub(z, length > 1 ? complex(newton.re / length, newton.im / length) : newton)
    if (length < 1e-13) break
  }
  return cAbs(cSub(cMul(c, cExp(z)), z)) < 1e-9 ? z : null
}

/**
 * The fixed points solve c e^z = z, so z = -W(-c) on each branch of the Lambert W function. Each branch is seeded from W's asymptotic
 * form (W_k(x) is about L - log L with L = log x + 2 pi i k) and polished with Newton. At a fixed point the multiplier is c e^z = z itself,
 * and every derivative of c e^z is z too, so b2 = z / 2 and b3 = z / 6.
 */
const fixedPoint = (c: Complex, previous: Complex | null): FixedPointResult => {
  const safe = cAbs(c) < 1e-9 ? complex(1e-9) : c
  const seeds = BRANCHES.map((k) => {
    const logTerm = cLog(complex(-safe.re, -safe.im))
    const big = complex(logTerm.re, logTerm.im + 2 * Math.PI * k)
    const w = cSub(big, cLog(big))
    return complex(-w.re, -w.im)
  })
  const roots = [...(previous ? [previous] : []), ...seeds]
    .map((seed) => polishFixedPoint(safe, seed))
    .filter((root): root is Complex => root !== null)
  const repelling = roots.filter((root) => cAbs(root) > MIN_REPELLING)
  const preference = (z: Complex): number => (cAbs(z) >= PREFERRED_MULTIPLIER ? -cAbs(z) : cAbs(z) - 1000)
  const z0 = pickFixedPoint(repelling, previous, preference) ?? previous ?? complex(2)
  return fixedPointResult(z0, z0, complex(z0.re / 2, z0.im / 2), complex(z0.re / 6, z0.im / 6))
}

const step = (z: [number, number], cRe: number, cIm: number): void => {
  const magnitude = Math.exp(Math.min(z[0], 60))
  const eRe = magnitude * Math.cos(z[1])
  const eIm = magnitude * Math.sin(z[1])
  z[0] = cRe * eRe - cIm * eIm
  z[1] = cRe * eIm + cIm * eRe
}

// e^z has no critical points; its one asymptotic value, 0, plays their part, so the parameter plane maps where 0's orbit goes.
const asymptoticOrbit = (c: Complex, maxIterations: number): { escaped: boolean; n: number; re: number } => {
  const z: [number, number] = [0, 0]
  for (let n = 0; n < maxIterations; n++) {
    step(z, c.re, c.im)
    if (z[0] > ESCAPE_REAL) return { escaped: true, n, re: z[0] }
  }
  return { escaped: false, n: maxIterations, re: 0 }
}

const smoothCount = (n: number, re: number): number =>
  n + 1 - Math.max(0, Math.min(1, Math.log(Math.log(re) / LOG_ESCAPE) / Math.log(ESCAPE_REAL / LOG_ESCAPE)))

// Picked offline: from the right of the parameter plane, where every point escapes and the whole plane fills with plumes, up and around
// through coral and feathered shapes to the spirals at the left. The named shapes are stops, at their exact c values. The zoom stays on the same fixed point along the way (its multiplier runs
// from 1.3 to 4.5).
const TOUR: readonly (readonly [number, number])[] = [
  [1.0, 0.0], [1.2036, -0.0321], [1.4091, -0.0426], [1.6, 0],
  [1.8006, 0.0805], [1.9889, 0.1646], [2.1705, 0.2622], [2.3384, 0.3816],
  [2.4719, 0.5374], [2.5254, 0.7348], [2.5195, 0.9407], [2.483, 1.1435],
  [2.4255, 1.3415], [2.35, 1.5333], [2.2, 1.8], [2.1318, 1.8811],
  [1.9734, 2.0126], [1.7958, 2.1173], [1.61, 2.2068], [1.4218, 2.2912],
  [1.2361, 2.3807], [1.057, 2.4831], [0.8817, 2.5916], [0.705, 2.698],
  [0.5223, 2.7937], [0.3302, 2.8682], [0.1287, 2.9108], [-0.077, 2.924],
  [-0.2831, 2.9177], [-0.4883, 2.8972], [-0.6921, 2.8659], [-0.8943, 2.8251],
  [-1.0943, 2.7749], [-1.29, 2.7099], [-1.4768, 2.6229], [-1.6514, 2.5133],
  [-1.815, 2.3877], [-1.9692, 2.2509], [-2.1156, 2.1056], [-2.255, 1.9536],
  [-2.3874, 1.7955], [-2.5118, 1.631], [-2.6, 1.5], [-2.7189, 1.2752],
  [-2.7982, 1.0848], [-2.8683, 0.8909], [-2.9332, 0.6951], [-3.0, 0.5],
]

/** The exponential family, c e^z: hair-like Cantor bouquets and plumes, everywhere at once. */
export const exponentialFamily: FractalFamily = {
  key: 'exponential',
  label: 'Plumes',
  description: 'Plumes, feathers and hairs of the exponential map, which reach out forever.',
  tour: TOUR,
  famousShapes: [
    { name: 'Fireworks', re: 1.6, im: 0, tourStop: 3 },
    { name: 'Coral', re: 2.2, im: 1.8, tourStop: 14 },
    { name: 'Peacock', re: -2.6, im: 1.5, tourStop: 42 },
  ],
  mapView: { reMin: -4.75, reMax: 4.25, imMin: -3, imMax: 3 },
  wholeSetRadius: 4,
  parameterScale: 3,
  wholeSetCenter: complex(1, 0),
  // Where the wrap error matches the classic family's at 0.2.
  seamSafeRadius: 0.25,
  referenceMultiplier: 2.8,
  fixedPoint,
  step,
  escaped: (zRe) => zRe > ESCAPE_REAL,
  parameterInSet: (c) => !asymptoticOrbit(c, 100).escaped,
  mapIterations: (c, maxIterations) => {
    const { escaped, n, re } = asymptoticOrbit(c, maxIterations)
    return escaped ? smoothCount(n, re) : -1
  },
  glsl: {
    step: 'float e = exp(min(z.x, 60.0)); return complexMul(c, e * vec2(cos(z.y), sin(z.y)));',
    escaped: `return z.x > ${ESCAPE_REAL}.0;`,
    smooth: `return n + 1.0 - clamp(log(log(z.x) / ${LOG_ESCAPE}) / ${Math.log(ESCAPE_REAL / LOG_ESCAPE)}, 0.0, 1.0);`,
  },
}
