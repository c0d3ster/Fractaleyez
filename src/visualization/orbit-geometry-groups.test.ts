import { describe, expect, it } from 'vitest'

import { geometryGroup, geometryGroupCount, isReshapedOnBeat } from './orbit-geometry-groups'

const configs = [[1, 1], [3, 3], [3, 4], [5, 4], [6, 5], [10, 7], [20, 12], [2, 1]] as const

describe('orbit geometry groups', () => {
  it('never puts a reshaped system and an unreshaped one in the same group, so Switcheroo is unchanged', () => {
    configs.forEach(([levels, layers]) => {
      const reshaped = new Map<number, boolean>()
      for (let level = 0; level < levels; level++) {
        for (let subset = 0; subset < layers; subset++) {
          const index = level * layers + subset
          const group = geometryGroup(subset, index)
          const seen = reshaped.get(group)
          if (seen !== undefined) expect(seen, `levels ${levels} layers ${layers} index ${index}`).toBe(isReshapedOnBeat(index))
          reshaped.set(group, isReshapedOnBeat(index))
        }
      }
    })
  })

  it('only groups systems of the same subset, which hold the same positions', () => {
    configs.forEach(([levels, layers]) => {
      const subsetOfGroup = new Map<number, number>()
      for (let level = 0; level < levels; level++) {
        for (let subset = 0; subset < layers; subset++) {
          const group = geometryGroup(subset, level * layers + subset)
          expect(subsetOfGroup.get(group) ?? subset).toBe(subset)
          subsetOfGroup.set(group, subset)
        }
      }
    })
  })

  it('needs one geometry per subset when the layer count is even', () => {
    expect(geometryGroupCount(5, 4)).toBe(4)
    expect(geometryGroupCount(20, 12)).toBe(12)
  })

  it('needs two per subset when the layer count is odd and there are enough levels to alternate', () => {
    expect(geometryGroupCount(3, 3)).toBe(6)
    expect(geometryGroupCount(10, 7)).toBe(14)
  })

  it('never needs more geometries than there are systems, and shares as soon as there are several levels', () => {
    configs.forEach(([levels, layers]) => expect(geometryGroupCount(levels, layers)).toBeLessThanOrEqual(levels * layers))
    expect(geometryGroupCount(5, 4)).toBeLessThan(5 * 4)
    expect(geometryGroupCount(1, 4)).toBe(4)
  })
})
