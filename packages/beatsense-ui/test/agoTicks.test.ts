import { describe, expect, it } from 'vitest'

import { agoTicks, formatAgo } from '../src/agoTicks'

describe('agoTicks', () => {
  it('picks a round step for the Section HUD\'s zoom range', () => {
    expect(agoTicks(30000)).toEqual([5000, 10000, 15000, 20000, 25000])
    expect(agoTicks(60000)).toEqual([10000, 20000, 30000, 40000, 50000])
    expect(agoTicks(120000)).toEqual([20000, 40000, 60000, 80000, 100000])
  })

  it('keeps every mark inside the view, never at its edge', () => {
    expect(agoTicks(45000)).toEqual([10000, 20000, 30000, 40000])
    expect(agoTicks(6000)).toEqual([1000, 2000, 3000, 4000, 5000])
  })

  it('gives nothing for an empty view', () => {
    expect(agoTicks(0)).toEqual([])
    expect(agoTicks(Number.NaN)).toEqual([])
  })
})

describe('formatAgo', () => {
  it('writes seconds, then minutes', () => {
    expect(formatAgo(5000)).toBe('-5s')
    expect(formatAgo(60000)).toBe('-1:00')
    expect(formatAgo(100000)).toBe('-1:40')
  })
})
