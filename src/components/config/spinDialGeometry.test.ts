import { describe, expect, it } from 'vitest'
import { angleToSpeed, arcPath, formatSpeed, regionAt, speedToAngle, SWEEP } from './spinDialGeometry'

const rotation = { min: -20, max: 20, step: 0.25 }
const spin = { min: -5, max: 5, step: 0.1 }

describe('speedToAngle', () => {
  it('puts 0 at the top and the ends at the sweep', () => {
    expect(speedToAngle(0, rotation)).toBe(0)
    expect(speedToAngle(20, rotation)).toBeCloseTo(SWEEP)
    expect(speedToAngle(-20, rotation)).toBeCloseTo(-SWEEP)
    expect(speedToAngle(10, rotation)).toBeCloseTo(SWEEP / 2)
  })

  it('keeps 0 at the top when the range is lopsided', () => {
    expect(speedToAngle(5, { min: -10, max: 5, step: 1 })).toBeCloseTo(SWEEP)
    expect(speedToAngle(-5, { min: -10, max: 5, step: 1 })).toBeCloseTo(-SWEEP / 2)
  })
})

describe('angleToSpeed', () => {
  it('is the inverse of speedToAngle', () => {
    ;[-20, -7.25, 0, 3.5, 20].forEach((speed) => expect(angleToSpeed(speedToAngle(speed, rotation), rotation)).toBeCloseTo(speed))
  })

  it('snaps to the step without float noise', () => {
    expect(angleToSpeed(speedToAngle(0.3, spin), spin)).toBe(0.3)
  })

  it('sends the gap at the bottom to the nearer end', () => {
    expect(angleToSpeed(Math.PI * 0.9, rotation)).toBe(20)
    expect(angleToSpeed(-Math.PI * 0.9, rotation)).toBe(-20)
    expect(angleToSpeed(Math.PI, rotation)).toBe(20)
  })

  it('treats a full extra turn as the same angle', () => {
    expect(angleToSpeed(SWEEP / 2 + Math.PI * 2, rotation)).toBeCloseTo(10)
  })
})

describe('regionAt', () => {
  it('splits the dial into hub, speed gauge and bearing ring', () => {
    expect(regionAt(2)).toBe('hub')
    expect(regionAt(25)).toBe('speed')
    expect(regionAt(44)).toBe('ring')
  })
})

describe('arcPath', () => {
  it('is empty with no length', () => {
    expect(arcPath(29, 0, 0)).toBe('')
  })

  it('runs clockwise for a positive speed and the other way for a negative one', () => {
    expect(arcPath(10, 0, Math.PI / 2)).toBe('M 0.000 -10.000 A 10 10 0 0 1 10.000 -0.000')
    expect(arcPath(10, 0, -Math.PI / 2)).toBe('M 0.000 -10.000 A 10 10 0 0 0 -10.000 -0.000')
  })

  it('takes the long way round past half a turn', () => {
    expect(arcPath(10, 0, SWEEP)).toContain('A 10 10 0 0 1')
    expect(arcPath(10, -SWEEP, SWEEP)).toContain('A 10 10 0 1 1')
  })
})

describe('formatSpeed', () => {
  it('drops trailing zeros', () => {
    expect(formatSpeed(2)).toBe('2')
    expect(formatSpeed(0.25)).toBe('0.25')
    expect(formatSpeed(-3.5)).toBe('-3.5')
  })
})
