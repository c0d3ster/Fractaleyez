import { describe, expect, it } from 'vitest'

import { DEFAULT_DETECTOR_MS, DetectorCalibration, detectorDelayOf, estimateLag, median } from './lag-estimate'

describe('estimateLag', () => {
  it('adds the wait for a frame, the drawing time and a monitor refresh to the detector delay', () => {
    const estimate = estimateLag({ ms: 7.6, calibrated: true }, 32.8, 0.7, 4.2)
    expect(estimate).toEqual({ totalMs: 33.8, detectorMs: 7.6, calibrated: true, waitMs: 21.3, workMs: 0.7, displayMs: 4.2 })
  })

  it('grows with a lower frame cap but not with it alone: the monitor refresh is separate', () => {
    const detector = { ms: DEFAULT_DETECTOR_MS.saver, calibrated: false }
    expect(estimateLag(detector, 32.8, 1, 4.2).totalMs).toBeGreaterThan(estimateLag(detector, 4.2, 1, 4.2).totalMs)
    expect(estimateLag(detector, 32.8, 1, 4.2).displayMs).toBe(4.2)
  })

  it('is the detector delay alone before any frames are known', () => {
    expect(estimateLag({ ms: 8, calibrated: false }, 0, 0, 0).totalMs).toBe(8)
  })

  it('predicts what was measured at each tier from the detector delay found at another', () => {
    // Median click-to-GPU time, drawing time and drawn frame time measured at four tiers on a 238 Hz monitor.
    const tiers = [
      { frame: 4.2, work: 0.7, submit: 10.8 },
      { frame: 8.3, work: 0.6, submit: 14.1 },
      { frame: 16.6, work: 1, submit: 19.6 },
      { frame: 32.8, work: 0.7, submit: 29.6 },
    ]
    const [calibrationTier, ...others] = tiers
    const detector = { ms: detectorDelayOf(calibrationTier!.submit, calibrationTier!.frame, calibrationTier!.work), calibrated: true }
    others.forEach(({ frame, work, submit }) => {
      expect(Math.abs(estimateLag(detector, frame, work, 4.2).totalMs - (submit + 4.2))).toBeLessThan(1.5)
    })
  })
})

describe('detectorDelayOf', () => {
  it('is what a measured click-to-GPU time leaves once the frame parts are taken out', () => {
    expect(detectorDelayOf(29.6, 32.8, 0.7)).toBeCloseTo(7.58, 1)
  })

  it('reproduces the measurement when the estimate is read under the same conditions', () => {
    const detector = detectorDelayOf(17.5, 4.2, 2.2)
    expect(estimateLag({ ms: detector, calibrated: true }, 4.2, 2.2, 4.2).totalMs).toBeCloseTo(17.5 + 4.2, 1)
  })

  it('never goes below zero', () => {
    expect(detectorDelayOf(3, 8, 5)).toBe(0)
  })
})

describe('median', () => {
  it('takes the middle, or the mean of the two middle values', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 2, 3])).toBe(2.5)
    expect(median([])).toBe(0)
  })
})

const makeStorage = (initial: Record<string, string> = {}): Pick<Storage, 'getItem' | 'setItem'> & { data: Map<string, string> } => {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (key: string): string | null => data.get(key) ?? null,
    setItem: (key: string, value: string): void => {
      data.set(key, value)
    },
  }
}

describe('DetectorCalibration', () => {
  it('is the typical figure given, marked uncalibrated, until something is saved', () => {
    const calibration = new DetectorCalibration(() => makeStorage())
    expect(calibration.read('48000|10010|2|ultra', 25)).toEqual({ ms: 25, calibrated: false })
  })

  it('keeps a saved delay for the setup it was measured with, across visits', () => {
    const storage = makeStorage()
    new DetectorCalibration(() => storage).save('48000|10010|2|ultra', 26.3)
    const later = new DetectorCalibration(() => storage)
    expect(later.read('48000|10010|2|ultra', 25)).toEqual({ ms: 26.3, calibrated: true })
  })

  it('keeps one delay per quality mode, and does not apply one to another', () => {
    const calibration = new DetectorCalibration(() => makeStorage())
    calibration.save('48000|10010|2|ultra', 26.3)
    calibration.save('48000|10010|2|saver', 12.1)
    expect(calibration.read('48000|10010|2|ultra', 25).ms).toBe(26.3)
    expect(calibration.read('48000|10010|2|saver', 14).ms).toBe(12.1)
    expect(calibration.read('48000|10010|2|balanced', 15)).toEqual({ ms: 15, calibrated: false })
  })

  it('does not apply once the bands or the Threshold change', () => {
    const calibration = new DetectorCalibration(() => makeStorage())
    calibration.save('48000|10010|2|ultra', 26.3)
    expect(calibration.read('48000|10010|3|ultra', 25).calibrated).toBe(false)
    expect(calibration.read('48000|11010|2|ultra', 25).calibrated).toBe(false)
  })

  it('ignores a value saved in the older single-delay shape', () => {
    const old = JSON.stringify({ setup: '48000|10010|2', detectorMs: 12.7 })
    const calibration = new DetectorCalibration(() => makeStorage({ lagDetectorCalibration: old }))
    expect(calibration.read('48000|10010|2', 8).calibrated).toBe(false)
  })

  it('shrugs off storage that is missing or holds something else', () => {
    expect(new DetectorCalibration(() => null).read('x', 5).calibrated).toBe(false)
    expect(new DetectorCalibration(() => makeStorage({ lagDetectorCalibration: 'not json' })).read('x', 5).calibrated).toBe(false)
    expect(() => new DetectorCalibration(() => null).save('x', 5)).not.toThrow()
  })
})
