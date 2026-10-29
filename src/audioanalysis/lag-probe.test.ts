import { describe, expect, it } from 'vitest'

import { clickSchedule, matchClicks, summarizeLag } from './lag-probe'

describe('matchClicks', () => {
  it('pairs each click with the first beat that follows it closely', () => {
    const samples = matchClicks([1000, 2000], [{ at: 1042, submittedAt: 1050 }, { at: 2038, submittedAt: 2049 }])
    expect(samples).toEqual([
      { clickAt: 1000, detectedAt: 1042, submittedAt: 1050 },
      { clickAt: 2000, detectedAt: 2038, submittedAt: 2049 },
    ])
  })

  it('leaves a click unheard when no beat lands near it', () => {
    const [sample] = matchClicks([1000], [{ at: 1900, submittedAt: 1910 }])
    expect(sample).toEqual({ clickAt: 1000, detectedAt: null, submittedAt: null })
  })

  it('does not take a beat that came long after the click, which was more likely something else', () => {
    const [sample] = matchClicks([1000], [{ at: 1250, submittedAt: 1260 }])
    expect(sample?.detectedAt).toBeNull()
  })

  it('does not take a beat that landed well before the click', () => {
    const [sample] = matchClicks([1000], [{ at: 900, submittedAt: 910 }])
    expect(sample?.detectedAt).toBeNull()
  })
})

describe('summarizeLag', () => {
  const samples = [
    { clickAt: 0, detectedAt: 30, submittedAt: 38 },
    { clickAt: 700, detectedAt: 746, submittedAt: 752 },
    { clickAt: 1400, detectedAt: 1424, submittedAt: 1431 },
    { clickAt: 2100, detectedAt: null, submittedAt: null },
  ]

  it('takes the median over the clicks that were heard and adds a display frame', () => {
    const result = summarizeLag(samples, { frameMs: 8.3, refreshMs: 4.2, workMs: 2, predictedMs: 40, saved: true, measuredAt: 1234 })
    expect(result).toEqual({ clicks: 4, heard: 3, detectMs: 30, submitMs: 38, worstMs: 52, frameMs: 8.3, refreshMs: 4.2, workMs: 2, totalMs: 42.2, detectorMs: 30.6, predictedMs: 40, saved: true, measuredAt: 1234 })
  })

  it('is null when nothing was heard', () => {
    expect(summarizeLag([{ clickAt: 0, detectedAt: null, submittedAt: null }], { frameMs: 8, refreshMs: 4, workMs: 2, predictedMs: 40, saved: true, measuredAt: 0 })).toBeNull()
  })
})

describe('clickSchedule', () => {
  const times = clickSchedule(1)

  it('sends ten clicks about 0.7 s apart, so the beat detector can fire for each', () => {
    expect(times).toHaveLength(10)
    times.slice(1).forEach((time, i) => {
      const gap = time - (times[i] ?? 0)
      expect(gap).toBeGreaterThan(0.66)
      expect(gap).toBeLessThan(0.76)
    })
  })

  it('spreads the clicks across the frame cycle at every frame cap, instead of landing on the same point each time', () => {
    ;[30, 60, 120, 238].forEach((fps) => {
      const frameMs = 1000 / fps
      const phases = times.map((time) => (time * 1000) % frameMs).sort((a, b) => a - b)
      const biggestGap = Math.max(...phases.map((phase, i) => (i === 0 ? phase + frameMs - (phases[phases.length - 1] ?? 0) : phase - (phases[i - 1] ?? 0))))
      expect(biggestGap).toBeLessThan(frameMs * 0.5)
    })
  })
})
