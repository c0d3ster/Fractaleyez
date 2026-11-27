import { cAbs, cAdd, cArg, cDiv, cMul, cScale, cSub, complex, type Complex } from './complex'

/**
 * Where the endless zoom dives and how it loops, for one Julia set. The zoom sits on a repelling fixed point z0 of the family's map f
 * (f(z0) = z0, |f'(z0)| > 1). Near it f acts like multiplying by the multiplier lambda = f'(z0), so zooming in by |lambda| and turning
 * by arg(lambda) shows the same picture again: that is the loop. The shader samples the plane through the inverse Koenigs coordinate
 * z = z0 + w + koenigs2 w^2 + koenigs3 w^3, which makes that "same picture again" exact to third order, so the wrap does not pop.
 */
export type FixedPointResult = {
  fixedPointX: number
  fixedPointY: number
  lambdaMag: number
  lambdaArg: number
  koenigs2: Complex
  koenigs3: Complex
}

// A fixed point barely repelling makes the zoom crawl (and pow(lambdaMag, -t) blow up), so the loop never uses less than this.
export const MIN_LAMBDA_MAG = 1.05

/**
 * The fixed point's loop data from its multiplier and the next two Taylor coefficients of f there:
 * f(z0 + u) = z0 + lambda u + b2 u^2 + b3 u^3, so b2 = f''(z0) / 2 and b3 = f'''(z0) / 6.
 *
 * The Koenigs coordinate phi(u) = u + a2 u^2 + a3 u^3 turns f into plain multiplication: phi(f(u)) = lambda phi(u). Matching powers of
 * u gives a2 = b2 / (lambda (1 - lambda)) and a3 = (b3 + 2 lambda a2 b2) / (lambda (1 - lambda^2)), and the inverse, which the shader
 * uses, is w - a2 w^2 + (2 a2^2 - a3) w^3. For z^2 + c (b2 = 1, b3 = 0) these are the formulas the
 * quadratic family has always used.
 */
export const fixedPointResult = (z0: Complex, lambda: Complex, b2: Complex, b3: Complex): FixedPointResult => {
  const one = complex(1)
  const a2 = cDiv(b2, cMul(lambda, cSub(one, lambda)))
  const a3 = cDiv(cAdd(b3, cScale(cMul(lambda, cMul(a2, b2)), 2)), cMul(lambda, cSub(one, cMul(lambda, lambda))))
  return {
    fixedPointX: z0.re,
    fixedPointY: z0.im,
    lambdaMag: Math.max(cAbs(lambda), MIN_LAMBDA_MAG),
    lambdaArg: cArg(lambda),
    koenigs2: cScale(a2, -1),
    koenigs3: cSub(cScale(cMul(a2, a2), 2), a3),
  }
}

/** The inverse Koenigs coordinate: the point of the plane that zoom coordinate w shows. */
export const koenigsPoint = (fixed: FixedPointResult, w: Complex): Complex => {
  const w2 = cMul(w, w)
  const k2 = cMul(fixed.koenigs2, w2)
  const k3 = cMul(fixed.koenigs3, cMul(w2, w))
  return { re: fixed.fixedPointX + w.re + k2.re + k3.re, im: fixed.fixedPointY + w.im + k2.im + k3.im }
}

// Staying on last frame's fixed point is only right while it is still close: the fixed points move continuously with c, so a big jump
// means the one we were on stopped being a candidate.
const MAX_TRACKING_JUMP = 0.25

/**
 * Which fixed point the zoom sits on, out of `candidates` (the repelling ones). While the shape glides, the zoom stays on the one it was
 * on (the nearest to `previous`), so the loop does not jump to another part of the set; otherwise it takes the candidate `preference`
 * scores highest.
 */
export const pickFixedPoint = (candidates: readonly Complex[], previous: Complex | null, preference: (z: Complex) => number): Complex | null => {
  if (candidates.length === 0) return null
  const distanceTo = (z: Complex): number => (previous ? Math.hypot(z.re - previous.re, z.im - previous.im) : Number.POSITIVE_INFINITY)
  const nearest = candidates.reduce((best, z) => (distanceTo(z) < distanceTo(best) ? z : best))
  if (distanceTo(nearest) < MAX_TRACKING_JUMP) return nearest
  return candidates.reduce((best, z) => (preference(z) > preference(best) ? z : best))
}
