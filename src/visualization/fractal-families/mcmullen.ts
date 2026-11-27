import { cAbs, cAdd, cDiv, cMul, cPow, cScale, complex, type Complex } from './complex'
import type { FractalFamily } from './family'
import { fixedPointResult, pickFixedPoint, type FixedPointResult } from './koenigs'
import { polynomialRoots } from './polynomial-roots'

const MIN_REPELLING = 1.05
const ESCAPE_RADIUS_SQUARED = 256
// A point this close to 0 lands on the pole and escapes at once (it would divide by zero).
const POLE_GUARD = 1e-30

// The map uses i c, not c: that turns the parameter plane a quarter (the Julia sets only turn a little), so its tall shape fits the wide
// shape pad.
const parameter = (c: Complex): Complex => complex(-c.im, c.re)

// f(z) = z^3 + a / z^3, so f'(z) = 3 z^2 - 3 a z^-4.
const multiplier = (z: Complex, a: Complex): Complex => cAdd(cScale(cMul(z, z), 3), cScale(cDiv(a, cPow(z, 4)), -3))

const fixedPoint = (c: Complex, previous: Complex | null): FixedPointResult => {
  const a = parameter(c)
  // z^3 + a / z^3 = z  <=>  z^6 - z^4 + a = 0.
  const roots = polynomialRoots([complex(1), complex(0), complex(-1), complex(0), complex(0), complex(0), a])
  const repelling = roots.filter((root) => cAbs(multiplier(root, a)) > MIN_REPELLING)
  // The fixed points on the outer edge of the rings (|z| near 1); the ones near the pole repel so hard the zoom would race.
  const z0 = pickFixedPoint(repelling, previous, cAbs) ?? roots.reduce((best, root) => (cAbs(root) > cAbs(best) ? root : best))
  // The second derivative is 6 z + 12 a z^-5 and the third 6 - 60 a z^-6; halved and divided by 6 they are the Taylor coefficients.
  const b2 = cAdd(cScale(z0, 3), cScale(cDiv(a, cPow(z0, 5)), 6))
  const b3 = cAdd(complex(1), cScale(cDiv(a, cPow(z0, 6)), -10))
  return fixedPointResult(z0, multiplier(z0, a), b2, b3)
}

const step = (z: [number, number], cRe: number, cIm: number): void => {
  const [re, im] = z
  const squareRe = re * re - im * im
  const squareIm = 2 * re * im
  const cubeRe = squareRe * re - squareIm * im
  const cubeIm = squareRe * im + squareIm * re
  const cubeSquared = cubeRe * cubeRe + cubeIm * cubeIm
  if (cubeSquared < POLE_GUARD) {
    z[0] = 1e10
    z[1] = 0
    return
  }
  // a / z^3 = a conj(z^3) / |z^3|^2, with a = i c.
  const aRe = -cIm
  const aIm = cRe
  z[0] = cubeRe + (aRe * cubeRe + aIm * cubeIm) / cubeSquared
  z[1] = cubeIm + (aIm * cubeRe - aRe * cubeIm) / cubeSquared
}

// The critical points solve z^6 = a, and all of them land on +-2 sqrt(a), whose orbits are mirror images: one orbit maps the plane.
const criticalOrbit = (c: Complex, maxIterations: number, escapeSquared: number): { escaped: boolean; n: number; zSquared: number } => {
  const a = parameter(c)
  const radius = Math.sqrt(cAbs(a))
  const angle = Math.atan2(a.im, a.re) / 2
  const z: [number, number] = [2 * radius * Math.cos(angle), 2 * radius * Math.sin(angle)]
  for (let n = 0; n < maxIterations; n++) {
    step(z, c.re, c.im)
    const zSquared = z[0] * z[0] + z[1] * z[1]
    if (zSquared > escapeSquared) return { escaped: true, n, zSquared }
  }
  return { escaped: false, n: maxIterations, zSquared: 0 }
}

// A spiral from the outer rings in toward the middle of the parameter plane: through Sierpinski-carpet shapes (the critical orbit escapes,
// so every hole is a copy of the outside) and the dark islands of the small Mandelbrot copies. Each stop's fixed point has a multiplier of
// 3 to 3.8.
const TOUR: readonly (readonly [number, number])[] = [
  [0.24, 0.0], [0.2352, 0.0157], [0.2294, 0.0309], [0.2227, 0.0453],
  [0.2151, 0.0589], [0.2066, 0.0717], [0.1975, 0.0837], [0.1876, 0.0948],
  [0.1772, 0.105], [0.1663, 0.1142], [0.155, 0.1224], [0.1433, 0.1296],
  [0.1313, 0.1358], [0.1192, 0.141], [0.107, 0.1453], [0.0948, 0.1485],
  [0.0826, 0.1508], [0.0706, 0.1521], [0.0587, 0.1525], [0.0472, 0.152],
  [0.0359, 0.1507], [0.0251, 0.1485], [0.0147, 0.1456], [0.0047, 0.142],
  [-0.0046, 0.1378], [-0.0134, 0.1329], [-0.0215, 0.1276], [-0.029, 0.1217],
  [-0.0358, 0.1154], [-0.0419, 0.1088], [-0.0473, 0.1019], [-0.0519, 0.0948],
  [-0.0559, 0.0875], [-0.0591, 0.0802], [-0.0615, 0.0728], [-0.0633, 0.0655],
  [-0.0644, 0.0582], [-0.0648, 0.0512], [-0.0646, 0.0443], [-0.0637, 0.0377],
  [-0.0623, 0.0315], [-0.0603, 0.0256], [-0.0579, 0.0201], [-0.055, 0.0151],
  [-0.0517, 0.0105], [-0.0481, 0.0065], [-0.0442, 0.003], [-0.04, 0.0],
]

/** McMullen maps, z^3 + a / z^3: rings and carpets of round holes, nested forever. */
export const mcmullenFamily: FractalFamily = {
  key: 'mcmullen',
  label: 'Rings',
  description: 'Rings and carpets of round holes, each hole another copy of the outside.',
  tour: TOUR,
  famousShapes: [
    { name: 'Lace', re: 0.24, im: 0, tourStop: 0 },
    { name: 'Web', re: 0.1313, im: 0.1358, tourStop: 12 },
    { name: 'Islands', re: 0.0147, im: 0.1456, tourStop: 22 },
    { name: 'Bubbles', re: -0.0623, im: 0.0315, tourStop: 40 },
  ],
  mapView: { reMin: -0.33, reMax: 0.33, imMin: -0.22, imMax: 0.22 },
  wholeSetRadius: 1.5,
  parameterScale: 0.22,
  wholeSetCenter: complex(0),
  // Where the wrap error matches the classic family's at 0.2.
  seamSafeRadius: 0.12,
  referenceMultiplier: 2.8,
  fixedPoint,
  step,
  escaped: (zRe, zIm) => zRe * zRe + zIm * zIm > ESCAPE_RADIUS_SQUARED,
  parameterInSet: (c) => !criticalOrbit(c, 200, 4).escaped,
  mapIterations: (c, maxIterations) => {
    const { escaped, n, zSquared } = criticalOrbit(c, maxIterations, ESCAPE_RADIUS_SQUARED)
    return escaped ? Math.max(0, n + 1 - Math.log(Math.log(Math.min(zSquared, 1e60)) * 0.5) / Math.log(3)) : -1
  },
  glsl: {
    step: `vec2 z3 = complexMul(complexSquare(z), z);
    float d = dot(z3, z3);
    if (d < 1e-30) return vec2(1e10, 0.0);
    vec2 a = vec2(-c.y, c.x);
    return z3 + vec2(a.x * z3.x + a.y * z3.y, a.y * z3.x - a.x * z3.y) / d;`,
    escaped: 'return dot(z, z) > 256.0;',
    // Points near the pole escape on the first step with a huge |z|, which would give a negative count (drawn black, as if inside).
    smooth: 'float m = min(dot(z, z), 1e30); return max(n + 1.0 - log(log(m) * 0.5) / log(3.0), 0.0);',
  },
}
