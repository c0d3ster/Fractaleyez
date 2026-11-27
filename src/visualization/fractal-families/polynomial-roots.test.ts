import { describe, expect, it } from 'vitest'

import { cAbs, complex } from './complex'
import { evaluatePolynomial, polynomialRoots } from './polynomial-roots'

describe('polynomialRoots', () => {
  it('finds every root of z^3 - 1', () => {
    const roots = polynomialRoots([complex(1), complex(0), complex(0), complex(-1)])
    expect(roots).toHaveLength(3)
    const angles = roots.map((root) => Math.atan2(root.im, root.re)).sort((a, b) => a - b)
    expect(angles[0]).toBeCloseTo(-2 * Math.PI / 3)
    expect(angles[1]).toBeCloseTo(0)
    expect(angles[2]).toBeCloseTo(2 * Math.PI / 3)
  })

  it('solves complex coefficients to high precision', () => {
    const coefficients = [complex(1), complex(0), complex(-1), complex(0), complex(0), complex(0), complex(0.01, -0.13)]
    const roots = polynomialRoots(coefficients)
    expect(roots).toHaveLength(6)
    roots.forEach((root) => expect(cAbs(evaluatePolynomial(coefficients, root))).toBeLessThan(1e-10))
  })
})
