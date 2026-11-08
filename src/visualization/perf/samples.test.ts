import { describe, expect, it } from 'vitest'

import { Samples } from './samples'

describe('Samples', () => {
  it('has no stats until something is recorded', () => {
    expect(new Samples().stats()).toBeNull()
  })

  it('reports percentiles of what it holds', () => {
    const samples = new Samples()
    for (let value = 1; value <= 100; value++) samples.push(value)
    expect(samples.stats()).toEqual({ n: 100, mean: 50.5, p50: 51, p95: 96, p99: 100, max: 100 })
  })

  it('keeps only the newest values once full', () => {
    const samples = new Samples(4)
    for (let value = 1; value <= 10; value++) samples.push(value)
    expect(samples.stats()).toMatchObject({ n: 4, max: 10, p50: 9 })
  })

  it('starts over after clear', () => {
    const samples = new Samples(4)
    samples.push(5)
    samples.clear()
    expect(samples.stats()).toBeNull()
    samples.push(2)
    expect(samples.stats()).toMatchObject({ n: 1, max: 2 })
  })
})
