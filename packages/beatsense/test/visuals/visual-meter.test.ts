import { describe, expect, it } from 'vitest'
import { VisualMeter } from '../../src/visuals'

const bytes = (length: number, value: number): Uint8Array => new Uint8Array(length).fill(value)

describe('VisualMeter', () => {
  const create = (): VisualMeter => new VisualMeter({ sampleRate: 48000, binCount: 256 })

  it('reads silence as zero energy', () => {
    const { energy, energyAverage } = create().read(bytes(256, 128), bytes(256, 0), 16)
    expect(energy).toBe(0)
    expect(energyAverage).toBe(0)
  })

  it('takes the energy as the mean distance from the midpoint', () => {
    const wave = new Uint8Array(256)
    wave.forEach((_, i) => { wave[i] = i % 2 === 0 ? 148 : 108 })
    expect(create().read(wave, bytes(256, 0), 16).energy).toBe(20)
  })

  it('averages the energy over the window and forgets older frames', () => {
    const meter = create()
    const loud = bytes(256, 228)
    const quiet = bytes(256, 128)
    meter.read(loud, bytes(256, 0), 1000)
    expect(meter.read(quiet, bytes(256, 0), 1000).energyAverage).toBeCloseTo(50, 5)
    for (let i = 0; i < 3; i++) meter.read(quiet, bytes(256, 0), 1000)
    expect(meter.read(quiet, bytes(256, 0), 1000).energyAverage).toBe(0)
  })

  it('keeps the average steady over many frames', () => {
    const meter = create()
    let last = 0
    for (let i = 0; i < 5000; i++) last = meter.read(bytes(256, 148), bytes(256, 0), 16).energyAverage
    expect(last).toBeCloseTo(20, 5)
  })

  it('splits the spectrum into eight bands with the treble inside the usable range', () => {
    const frequency = new Uint8Array(256)
    frequency.fill(200, 0, 3)
    frequency.fill(100, 131, 171)
    frequency.fill(255, 171)
    const { bands } = create().read(bytes(256, 128), frequency, 16)
    expect(bands).toHaveLength(8)
    expect(bands[0]).toBe(200)
    expect(bands[7]).toBe(100)
  })

  it('returns the same object each frame', () => {
    const meter = create()
    expect(meter.read(bytes(256, 128), bytes(256, 0), 16)).toBe(meter.read(bytes(256, 128), bytes(256, 0), 16))
  })

  it('rejects a spectrum too small for its bands', () => {
    expect(() => new VisualMeter({ sampleRate: 48000, binCount: 4 })).toThrow(RangeError)
  })
})
