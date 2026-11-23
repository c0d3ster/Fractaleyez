import { describe, expect, it } from 'vitest'

import { isThresholdChange, ThresholdLog } from '../../lab/recording/thresholdLog'

const MODEL = { kick: 0.875, hat: 0.75, snare: 0.8, clap: 0.85 }

describe('ThresholdLog', () => {
  it('gives the thresholds in effect at the start, then each change up to the end', () => {
    const log = new ThresholdLog()
    log.push(0, MODEL)
    log.push(500, { ...MODEL, hat: 0.9 })
    log.push(1500, { ...MODEL, hat: 0.95 })
    log.push(3000, MODEL)
    expect(log.between(1000, 2000)).toEqual([
      { t: 1000, thresholds: { ...MODEL, hat: 0.9 } },
      { t: 1500, thresholds: { ...MODEL, hat: 0.95 } },
    ])
  })

  it('keeps one change per time, the newest', () => {
    const log = new ThresholdLog()
    log.push(100, MODEL)
    log.push(100, { ...MODEL, kick: 0.5 })
    expect(log.between(0, 200)).toEqual([{ t: 100, thresholds: { ...MODEL, kick: 0.5 } }])
  })

  it('copies the thresholds it is given', () => {
    const log = new ThresholdLog()
    const thresholds = { ...MODEL }
    log.push(0, thresholds)
    thresholds.hat = 0
    expect(log.between(0, 10)[0]!.thresholds.hat).toBe(0.75)
  })

  it('reads a change only with every drum between 0 and 1', () => {
    expect(isThresholdChange({ t: 0, thresholds: MODEL })).toBe(true)
    expect(isThresholdChange({ t: 0, thresholds: { ...MODEL, clap: 1.5 } })).toBe(false)
    expect(isThresholdChange({ t: 0, thresholds: { kick: 0.5 } })).toBe(false)
    expect(isThresholdChange({ thresholds: MODEL })).toBe(false)
  })
})
