import { describe, expect, it } from 'vitest'

import { MAX_TWIST, copyMatrix, followTwist, rigidTurn, twistForSpin } from './logo-spiral'

const apply = (m: number[], x: number, y: number): [number, number] => [
  (m[0] ?? 0) * x + (m[4] ?? 0) * y + (m[12] ?? 0),
  (m[1] ?? 0) * x + (m[5] ?? 0) * y + (m[13] ?? 0),
]

describe('copyMatrix', () => {
  it('is the plain scale about the focus when there is no turn', () => {
    const m = copyMatrix(0.25, 0, 1.8, 0.1, -0.2)
    const [x, y] = apply(m, 0.4, 0.3)
    expect(x).toBeCloseTo(0.1 * (1 - 0.25) + 0.25 * 0.4)
    expect(y).toBeCloseTo(-0.2 * (1 - 0.25) + 0.25 * 0.3)
  })

  it('keeps the focus point where it is', () => {
    const m = copyMatrix(0.0625, 1.3, 2.2, 0.17, 0.08)
    const [x, y] = apply(m, 0.17, 0.08)
    expect(x).toBeCloseTo(0.17)
    expect(y).toBeCloseTo(0.08)
  })

  it('turns without shearing in the image proportions', () => {
    const aspect = 3
    const m = copyMatrix(1, Math.PI / 2, aspect, 0, 0)
    // A quarter turn clockwise takes the image's right (aspect, 0 in its proportions) to straight down.
    const [x, y] = apply(m, 0.5, 0)
    expect(x * aspect).toBeCloseTo(0)
    expect(y).toBeCloseTo(-0.5 * aspect)
  })

  // What makes the loop seamless: one level of zoom (scale 16, turn by the twist) applied to a copy is the next copy out.
  it('composes: scales multiply and turns add', () => {
    const [aspect, px, py] = [1.5, 0.1, 0.05]
    const outer = copyMatrix(16, 0.7, aspect, px, py)
    const copy = copyMatrix(0.0625, -1.1, aspect, px, py)
    const both = copyMatrix(1, -0.4, aspect, px, py)
    const [ox, oy] = apply(outer, ...apply(copy, 0.3, -0.2))
    const [bx, by] = apply(both, 0.3, -0.2)
    expect(ox).toBeCloseTo(bx)
    expect(oy).toBeCloseTo(by)
  })
})

describe('twist', () => {
  it('follows the spin direction and is capped', () => {
    expect(twistForSpin(0)).toBe(0)
    expect(twistForSpin(1)).toBeGreaterThan(0)
    expect(twistForSpin(-1)).toBeLessThan(0)
    expect(twistForSpin(100)).toBe(MAX_TWIST)
    expect(twistForSpin(-100)).toBe(-MAX_TWIST)
  })

  it('eases toward its target', () => {
    const next = followTwist(0, 1, 0.15)
    expect(next).toBeCloseTo(0.5)
    expect(followTwist(0.3, 1, 0)).toBeCloseTo(0.3)
  })

  it('leaves the rigid turn with whatever the zoom does not cover', () => {
    const spin = 0.02
    const twist = 0.5
    const levelStep = 0.01
    expect(rigidTurn(spin, twist, levelStep) + twist * levelStep).toBeCloseTo(spin)
    expect(rigidTurn(spin, twist, 0)).toBe(spin)
  })
})
