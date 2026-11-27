import { cAbs, cAdd, cDiv, cMul, cSub, complex, type Complex } from './complex'

const MAX_ITERATIONS = 200
const TOLERANCE = 1e-13

/** p(z) for coefficients from the highest power down (Horner). */
export const evaluatePolynomial = (coefficients: readonly Complex[], z: Complex): Complex =>
  coefficients.reduce((value, coefficient) => cAdd(cMul(value, z), coefficient), complex(0))

/**
 * Every root of a monic polynomial, coefficients from the highest power down (the first must be 1), by the Durand-Kerner method: each
 * guess is pushed by p(z_i) / prod(z_i - z_j), and all of them settle on distinct roots together. The polynomial families have degree 6 at
 * most, where this converges in a few dozen steps.
 */
export const polynomialRoots = (coefficients: readonly Complex[]): Complex[] => {
  const degree = coefficients.length - 1
  // Starting guesses on a spiral that is not symmetric, the usual choice: (0.4 + 0.9i)^k.
  const seed = complex(0.4, 0.9)
  let roots = Array.from({ length: degree }, (_, k): Complex => {
    let guess = complex(1)
    for (let i = 0; i < k; i++) guess = cMul(guess, seed)
    return guess
  })
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    let largestStep = 0
    roots = roots.map((root, i) => {
      const denominator = roots.reduce((product, other, j) => (i === j ? product : cMul(product, cSub(root, other))), complex(1))
      const step = cDiv(evaluatePolynomial(coefficients, root), denominator)
      largestStep = Math.max(largestStep, cAbs(step))
      return cSub(root, step)
    })
    if (largestStep < TOLERANCE) break
  }
  return roots
}
