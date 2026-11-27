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

// Past -e (in the black region of period 2, Peacock's side) the fixed point near -1, which attracts inside the main black region, repels
// only just (multiplier 1.05 to 1.1), and zooming on it shows the spiraling feathers that make Peacock. Only c near -e has a fixed point
// near -1, and inside the main black region it attracts, so this applies nowhere else. It is too weak for the usual
// choice, so it is taken whenever it repels clearly enough there, and kept while it still repels at all (the gap stops drift and bass from
// flipping the zoom between it and another point).
const SPIRAL_ENTER = 1.055
const SPIRAL_KEEP = 1.03
const SPIRAL_REACH = 0.35

const spiralFixedPoint = (roots: readonly Complex[], previous: Complex | null): Complex | null => {
  const spiral = roots.find((root) => Math.hypot(root.re + 1, root.im) < SPIRAL_REACH)
  if (!spiral) return null
  const kept = previous !== null && Math.hypot(previous.re - spiral.re, previous.im - spiral.im) < 0.05
  return cAbs(spiral) >= (kept ? SPIRAL_KEEP : SPIRAL_ENTER) ? spiral : null
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
  const roots = [...(previous ? [previous] : []), ...seeds, complex(-1)]
    .map((seed) => polishFixedPoint(safe, seed))
    .filter((root): root is Complex => root !== null)
  const repelling = roots.filter((root) => cAbs(root) > MIN_REPELLING)
  const preference = (z: Complex): number => (cAbs(z) >= PREFERRED_MULTIPLIER ? -cAbs(z) : cAbs(z) - 1000)
  const z0 = spiralFixedPoint(roots, previous) ?? pickFixedPoint(repelling, previous, preference) ?? previous ?? complex(2)
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

// Right of 1/e on the real axis every point escapes, but just off the axis black islands come and go, so there the drift and audio offset
// stays on the axis. Everywhere it is a third of the usual size, which keeps Bouquet (0.3) on its side of 1/e at full bass.
const ONE_OVER_E = 1 / Math.E
const OFFSET_SCALE = 1 / 3
const shapeOffset = (shape: Complex, offset: Complex): Complex =>
  complex(offset.re * OFFSET_SCALE, shape.im === 0 && shape.re > ONE_OVER_E ? 0 : offset.im * OFFSET_SCALE)

const smoothCount = (n: number, re: number): number =>
  n + 1 - Math.max(0, Math.min(1, Math.log(Math.log(re) / LOG_ESCAPE) / Math.log(ESCAPE_REAL / LOG_ESCAPE)))

// The point 1/e on the real axis splits the parameter plane's two looks. Right of it along the axis every point escapes and plumes fill the
// whole picture; inside the big black region left of it (where c e^z has an attracting fixed point) the picture is a solid black area
// edged with plumes. Around the outside of that region, small black islands and escaping hairs alternate, so a tour through there flashed
// between the two looks. This one stays clear of that: from far right along the real axis (exactly on it, the only clean way in), across
// 1/e once, then inside the black region to Coral and along just inside its lower edge to Feathers, out along the axis through -e (where
// it touches the black region of period 2 without any hairs between) and up to Peacock. The named shapes are stops, at their exact c values.
const TOUR: readonly (readonly [number, number])[] = [
  [3.6, 0.0], [3.4, 0.0], [3.2, 0.0], [3.0, 0.0],
  [2.8, 0.0], [2.6, 0.0], [2.4, 0.0], [2.2, 0.0],
  [2.0, 0.0], [1.8, 0.0], [1.6, 0.0], [1.4, 0.0],
  [1.2, 0.0], [1.0, 0.0], [0.8, 0.0], [0.3, 0.0],
  [0.2, 0.0], [0.3927, -0.1142], [0.6, -0.2], [0.6912, -0.3734],
  [0.7326, -0.565], [0.7275, -0.7611], [0.6825, -0.9521], [0.6025, -1.1314],
  [0.4926, -1.294], [0.3576, -1.4366], [0.2022, -1.5568], [0.0309, -1.6528],
  [-0.1523, -1.7237], [-0.3434, -1.7692], [-0.5917, -1.7829], [-0.695, -1.6518],
  [-0.8277, -1.4913], [-0.9326, -1.3115], [-1.0056, -1.1166], [-1.0431, -0.9119],
  [-1.042, -0.7038], [-1.0, -0.5], [-1.2032, -0.517], [-1.407, -0.5131],
  [-1.6095, -0.4893], [-1.8089, -0.447], [-2.0039, -0.3874], [-2.1933, -0.3117],
  [-2.3759, -0.2211], [-2.5512, -0.1169], [-2.7183, 0.0], [-2.9248, 0.0],
  [-3.0, 0.1313], [-3.0, 0.3379], [-3.0, 0.5], [-2.9332, 0.6951],
  [-2.8683, 0.8909], [-2.7982, 1.0848], [-2.7189, 1.2752], [-2.6, 1.5],
]

/** The exponential family, c e^z: hair-like Cantor bouquets and plumes, everywhere at once. */
export const exponentialFamily: FractalFamily = {
  key: 'exponential',
  label: 'Bouquet',
  mathName: 'Exponential family',
  formula: 'c·eᶻ',
  description: 'Plumes, feathers and hairs that reach out forever.',
  tour: TOUR,
  famousShapes: [
    { name: 'Starburst', re: 3.6, im: 0, tourStop: 0 },
    { name: 'Fireworks', re: 1.6, im: 0, tourStop: 10 },
    { name: 'Bouquet', re: 0.3, im: 0, tourStop: 15 },
    { name: 'Coral', re: 0.6, im: -0.2, tourStop: 18 },
    { name: 'Fans', re: -0.5917, im: -1.7829, tourStop: 30 },
    { name: 'Feathers', re: -1, im: -0.5, tourStop: 37 },
    { name: 'Peacock', re: -2.6, im: 1.5, tourStop: 55 },
  ],
  mapHint: 'Bouquet is never fully solid. Dark spots give solid areas edged with plumes, and bright spots fill the picture with plumes. The zoom dives into the plumes, so lower Scale to see the solid areas.',
  mapView: { reMin: -4.75, reMax: 4.25, imMin: -3, imMax: 3 },
  wholeSetRadius: 4,
  parameterScale: 3,
  wholeSetCenter: complex(1, 0),
  shapeOffset,
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
