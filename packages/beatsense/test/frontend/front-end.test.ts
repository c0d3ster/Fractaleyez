import { describe, expect, it } from 'vitest'

import { BandLevels, FrontEnd, ONSET_BANDS, SpectrumAnalyser, SPECTRUM_BANDS, webAudioBiquad } from '../../src'
import fixture from './levels-parity.json'
import { parityPcm } from './parity-signal'

// Relative to the larger of the value and 1, so a level near zero is not held to an impossible relative error.
const TOLERANCE = 1e-4

describe('webAudioBiquad', () => {
  it('has unity gain at DC for a lowpass and zero for a highpass', () => {
    const dc = ({ b0, b1, b2, a1, a2 }: ReturnType<typeof webAudioBiquad>): number => (b0 + b1 + b2) / (1 + a1 + a2)
    expect(dc(webAudioBiquad('lowpass', 1000, 44100))).toBeCloseTo(1, 12)
    expect(dc(webAudioBiquad('highpass', 1000, 44100))).toBeCloseTo(0, 12)
  })

  it('caps the corner just under Nyquist', () => {
    expect(webAudioBiquad('lowpass', 30000, 44100)).toEqual(webAudioBiquad('lowpass', 44100 / 2 * 0.999, 44100))
  })
})

describe('BandLevels parity with levels.py', () => {
  it('matches its band levels on the synthetic signal to 1e-4 relative', () => {
    const { sampleRate, fps, levels } = fixture
    const pcm = parityPcm(sampleRate)
    const bands = new BandLevels(sampleRate)
    let fed = 0
    levels.forEach((expected, f) => {
      const end = Math.floor((f * sampleRate) / fps)
      bands.push(pcm.subarray(fed, end))
      fed = end
      const actual = bands.read()
      expected.forEach((value, b) => {
        expect(Math.abs(actual[b]! - value) / Math.max(Math.abs(value), 1), `frame ${f} band ${b}`).toBeLessThan(TOLERANCE)
      })
    })
  })

  it('has a fixture with sound in every band', () => {
    const peaks = ONSET_BANDS.map((_, b) => Math.max(...fixture.levels.map((frame) => frame[b]!)))
    peaks.forEach((peak) => expect(peak).toBeGreaterThan(0.1))
  })
})

describe('FrontEnd', () => {
  it('reads silence as zero levels and zero energy', () => {
    const frontEnd = new FrontEnd(48000)
    frontEnd.push(new Float32Array(2048))
    const { levels, energy, spectrum } = frontEnd.read()
    expect(levels).toEqual([0, 0, 0, 0, 0])
    expect(energy).toBe(0)
    expect(spectrum).toHaveLength(SPECTRUM_BANDS)
    expect(Array.from(spectrum!).every((v) => v === 0)).toBe(true)
  })

  it('puts a tone in its own band and its own spectrum bins', () => {
    const sampleRate = 48000
    const tone = Float32Array.from({ length: 4096 }, (_, n) => 0.5 * Math.sin((2 * Math.PI * 1000 * n) / sampleRate))
    const frontEnd = new FrontEnd(sampleRate)
    frontEnd.push(tone)
    const { levels, energy, spectrum } = frontEnd.read()
    const loudest = levels.indexOf(Math.max(...levels))
    expect(loudest).toBe(2)
    expect(energy).toBeGreaterThan(20)
    expect(Math.max(...Array.from(spectrum!))).toBeGreaterThan(100)
  })

  it('skips the spectrum when asked', () => {
    expect(new FrontEnd(48000, { spectrum: false }).read().spectrum).toBeUndefined()
  })
})

describe('SpectrumAnalyser', () => {
  it('peaks at the bin of a tone and smooths across reads', () => {
    const sampleRate = 48000
    const analyser = new SpectrumAnalyser(512, 0.5)
    analyser.push(Float32Array.from({ length: 512 }, (_, n) => 0.002 * Math.sin((2 * Math.PI * 4687.5 * n) / sampleRate)))
    const first = Array.from(analyser.read())
    expect(first.indexOf(Math.max(...first))).toBe(50)
    const second = Array.from(analyser.read())
    expect(second[50]!).toBeGreaterThan(first[50]!)
  })
})
