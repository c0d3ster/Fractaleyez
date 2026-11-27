import { cDiv, cMul, cScale, cSub, complex, type Complex } from './complex'
import type { FamousShape, FractalFamily } from './family'
import type { FixedPointResult } from './koenigs'

// The Shape slider walks a tour of Julia-set c values, smoothly interpolated between points. The path
// was generated offline: it passes through famous shapes (airplane, basilica, galaxy, Siegel disk,
// rabbit, dendrite, then back along the main cardioid's boundary through the San Marco / seahorse
// area), each stretch snapped onto the Mandelbrot set and resampled evenly, so neighbors look related
// and almost every position is a connected, detailed shape instead of dust. Near-cusp c values
// (close to 0.25) are avoided: the fixed point's multiplier approaches 1 there, so the zoom crawls.
// Every point has a repelling-fixed-point multiplier of at least 1.89. Each named shape below is one of the stops, at its
// exact c value, so picking it moves the Tour slider there and the shape stays on the Tour.
const TOUR: readonly (readonly [number, number])[] = [
  [-1.7549, 0], [-1.628, 0], [-1.484, 0], [-1.384, 0.012],
  [-1.2647, 0.0283], [-1.1409, 0.025], [-1, 0], [-0.9121, -0.0546],
  [-0.8377, -0.153], [-0.732, -0.208], [-0.704, -0.288], [-0.644, -0.416],
  [-0.568, -0.48], [-0.521, -0.5895], [-0.390541, -0.586788], [-0.3778, -0.4834],
  [-0.3772, -0.3595], [-0.3815, -0.2357], [-0.3877, -0.112], [-0.3947, 0.0117],
  [-0.4016, 0.1354], [-0.4074, 0.2591], [-0.4111, 0.3829], [-0.4097, 0.5068],
  [-0.3759, 0.6201], [-0.284, 0.644], [-0.22, 0.732], [-0.1226, 0.7449],
  [-0.092, 0.8616], [0, 1], [-0.092, 0.872], [-0.024, 0.784],
  [0.068, 0.648], [0.148, 0.612], [0.2558, 0.5541], [0.3081, 0.4438],
  [0.3638, 0.338], [0.3625, 0.301], [0.3026, 0.4094], [0.233, 0.5116],
  [0.1331, 0.583], [0.017, 0.6258], [-0.1048, 0.6474], [-0.2273, 0.6399],
  [-0.3432, 0.5969], [-0.4504, 0.535], [-0.55, 0.4615], [-0.6354, 0.3736],
  [-0.6929, 0.2657], [-0.732, 0.1481], [-0.75, 0], [-0.7269, 0.1889],
]

// Exact c values for well-known Julia sets, each a stop on the tour.
const FAMOUS_SHAPES: readonly FamousShape[] = [
  { name: 'San Marco', re: -0.75, im: 0, tourStop: 50 },
  { name: 'Rabbit', re: -0.1226, im: 0.7449, tourStop: 27 },
  { name: 'Airplane', re: -1.7549, im: 0, tourStop: 0 },
  { name: 'Dendrite', re: 0, im: 1, tourStop: 29 },
  { name: 'Siegel disk', re: -0.390541, im: -0.586788, tourStop: 14 },
  { name: 'Basilica', re: -1, im: 0, tourStop: 6 },
]

// Closed-form repelling fixed point + multiplier for f(z) = z^2 + c.
// Fixed points solve z^2 + c = z, i.e. z = (1 +/- sqrt(1 - 4c)) / 2 (Vieta's formulas).
// The multiplier at a fixed point is f'(z) = 2z; we pick whichever root has |2z| > 1 (repelling).
// This is the general Koenigs construction in koenigs.ts with b2 = 1, b3 = 0, kept in its original closed form so the classic
// fractal draws exactly as it always has.
const fixedPoint = ({ re: cx, im: cy }: Complex): FixedPointResult => {
  const dx = 1 - 4 * cx
  const dy = -4 * cy
  const dMag = Math.hypot(dx, dy)

  const sqrtX = Math.sqrt(Math.max(0, (dMag + dx) / 2))
  const sqrtYMagnitude = Math.sqrt(Math.max(0, (dMag - dx) / 2))
  const sqrtY = dy < 0 ? -sqrtYMagnitude : sqrtYMagnitude

  const z1x = (1 + sqrtX) / 2
  const z1y = sqrtY / 2
  const z2x = (1 - sqrtX) / 2
  const z2y = -sqrtY / 2

  const mag1 = 2 * Math.hypot(z1x, z1y)
  const mag2 = 2 * Math.hypot(z2x, z2y)

  const useFirst = mag1 >= mag2
  const fixedPointX = useFirst ? z1x : z2x
  const fixedPointY = useFirst ? z1y : z2y

  // Guard against near-parabolic c (both fixed points weakly repelling) so pow(lambdaMag, -t) stays sane.
  const lambdaMag = Math.max(mag1, mag2, 1.05)
  const lambdaArg = Math.atan2(2 * fixedPointY, 2 * fixedPointX)

  // Inverse Koenigs coordinate to third order (see koenigs.ts): a2 = 1 / (lambda (1 - lambda)), a3 = 2 a2 / (1 - lambda^2),
  // c2 = -a2, c3 = 2 a2^2 - a3.
  const lambda: Complex = { re: 2 * fixedPointX, im: 2 * fixedPointY }
  const one: Complex = { re: 1, im: 0 }
  const a2 = cDiv(one, cMul(lambda, cSub(one, lambda)))
  const a3 = cDiv(cScale(a2, 2), cSub(one, cMul(lambda, lambda)))
  const koenigs2 = cScale(a2, -1)
  const koenigs3 = cSub(cScale(cMul(a2, a2), 2), a3)

  return { fixedPointX, fixedPointY, lambdaMag, lambdaArg, koenigs2, koenigs3 }
}

const ESCAPE_RADIUS_SQUARED = 256

// True when c is inside the Mandelbrot set, i.e. its Julia set is connected and detailed rather than dust.
const inMandelbrotSet = ({ re: cx, im: cy }: Complex): boolean => {
  let zRe = 0
  let zIm = 0
  for (let n = 0; n < 200; n++) {
    const nextRe = zRe * zRe - zIm * zIm + cx
    zIm = 2 * zRe * zIm + cy
    zRe = nextRe
    if (zRe * zRe + zIm * zIm > 4) return false
  }
  return true
}

// The Mandelbrot set, as the shape pad draws it.
const mandelbrotIterations = ({ re: cRe, im: cIm }: Complex, maxIterations: number): number => {
  let zRe = 0
  let zIm = 0
  for (let n = 0; n < maxIterations; n++) {
    const nextRe = zRe * zRe - zIm * zIm + cRe
    zIm = 2 * zRe * zIm + cIm
    zRe = nextRe
    const magnitude = zRe * zRe + zIm * zIm
    if (magnitude > ESCAPE_RADIUS_SQUARED) return n + 1 - Math.log(Math.log(magnitude) * 0.5) / Math.LN2
  }
  return -1
}

/** The classic: z^2 + c, the Julia sets the Mandelbrot set maps. */
export const quadraticFamily: FractalFamily = {
  key: 'quadratic',
  label: 'Classic',
  description: 'The classic Julia sets: spirals, seahorses and lightning, mapped by the Mandelbrot set.',
  tour: TOUR,
  famousShapes: FAMOUS_SHAPES,
  mapView: { reMin: -2.2, reMax: 0.8, imMin: -1, imMax: 1 },
  wholeSetRadius: 1.75,
  parameterScale: 1,
  wholeSetCenter: complex(0),
  seamSafeRadius: 0.2,
  fixedPoint,
  step: (z, cRe, cIm) => {
    const [zRe, zIm] = z
    z[0] = zRe * zRe - zIm * zIm + cRe
    z[1] = 2 * zRe * zIm + cIm
  },
  escaped: (zRe, zIm) => zRe * zRe + zIm * zIm > ESCAPE_RADIUS_SQUARED,
  parameterInSet: inMandelbrotSet,
  mapIterations: mandelbrotIterations,
  glsl: {
    step: 'return complexSquare(z) + c;',
    escaped: 'return dot(z, z) > 256.0;',
    smooth: 'float logZn = log(dot(z, z)) * 0.5; return n + 1.0 - log2(logZn);',
  },
}
