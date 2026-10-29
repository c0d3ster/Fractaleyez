import { describe, expect, it } from 'vitest'

import {
  AUTO_START_TIER,
  AUTO_TIERS,
  capHidesLoad,
  DIAL_DETAILS,
  estimateSceneCost,
  FRACTAL_MAX_ITERATIONS,
  isDialDetail,
  isQualitySetting,
  QUALITY_HINTS,
  QUALITY_LABELS,
  QUALITY_PROFILES,
  QUALITY_SETTINGS,
  QUALITY_TIERS,
  SceneCostInputs,
} from './quality.config'

const scene: SceneCostInputs = {
  fractal: true,
  orbit: true,
  video: false,
  logo: false,
  glow: true,
  kaleidoscope: false,
  particles: { particlesPerLayer: 7500, layers: 2, levels: 2, particleSize: 50 },
}

describe('quality profiles', () => {
  it('never ask for more fractal iterations than the shader loop allows', () => {
    QUALITY_TIERS.forEach((tier) => expect(QUALITY_PROFILES[tier].fractalIterations).toBeLessThanOrEqual(FRACTAL_MAX_ITERATIONS))
  })

  it('spend more on every lever the higher the tier', () => {
    QUALITY_TIERS.slice(1).forEach((tier, i) => {
      const lighter = QUALITY_PROFILES[QUALITY_TIERS[i]!]
      const heavier = QUALITY_PROFILES[tier]
      expect(heavier.fractalScale).toBeGreaterThanOrEqual(lighter.fractalScale)
      expect(heavier.fractalIterations).toBeGreaterThanOrEqual(lighter.fractalIterations)
      expect(heavier.bloomScale).toBeGreaterThanOrEqual(lighter.bloomScale)
      expect(heavier.uiTickHz).toBeGreaterThanOrEqual(lighter.uiTickHz)
      expect(DIAL_DETAILS.indexOf(heavier.dialDetail)).toBeGreaterThanOrEqual(DIAL_DETAILS.indexOf(lighter.dialDetail))
    })
  })

  it('keeps the full kaleidoscope dial out of every tier, since it costs the video its smoothness', () => {
    QUALITY_TIERS.forEach((tier) => expect(QUALITY_PROFILES[tier].dialDetail).not.toBe('full'))
  })

  it('knows the dial levels by name', () => {
    DIAL_DETAILS.forEach((level) => expect(isDialDetail(level)).toBe(true))
    expect(isDialDetail('everything')).toBe(false)
    expect(isDialDetail(null)).toBe(false)
  })

  it('has Quality draw what the app drew before there were tiers, capped at 120fps', () => {
    expect(QUALITY_PROFILES.quality).toMatchObject({ frameCapFps: 120, fractalScale: 1, fractalIterations: 128, bloomScale: 0.5, videoUploadFps: null })
  })

  it('lets Auto reach Ultra, which stays uncapped', () => {
    expect(AUTO_TIERS).toContain('ultra')
    expect(QUALITY_PROFILES.ultra.frameCapFps).toBeNull()
  })

  it('starts Auto on a tier it can pick', () => {
    expect(AUTO_TIERS).toContain(AUTO_START_TIER)
  })

  it('has a label and a hint for every setting', () => {
    QUALITY_SETTINGS.forEach((setting) => {
      expect(QUALITY_LABELS[setting]).toBeTruthy()
      expect(QUALITY_HINTS[setting]).toBeTruthy()
    })
  })
})

describe('isQualitySetting', () => {
  it('accepts auto and every tier and nothing else', () => {
    QUALITY_SETTINGS.forEach((setting) => expect(isQualitySetting(setting)).toBe(true))
    ;['low', '', 'Auto', 3, null, undefined].forEach((value) => expect(isQualitySetting(value)).toBe(false))
  })
})

describe('estimateSceneCost', () => {
  it('is lower with a layer switched off', () => {
    expect(estimateSceneCost({ ...scene, fractal: false })).toBeLessThan(estimateSceneCost(scene))
    expect(estimateSceneCost({ ...scene, orbit: false })).toBeLessThan(estimateSceneCost(scene))
  })

  it('is lower with fewer particles', () => {
    expect(estimateSceneCost({ ...scene, particles: { ...scene.particles, particlesPerLayer: 1000 } })).toBeLessThan(estimateSceneCost(scene))
  })

  it('is zero for an empty scene', () => {
    expect(estimateSceneCost({ ...scene, fractal: false, orbit: false, glow: false })).toBe(0)
  })
})

describe('capHidesLoad', () => {
  it('is false without a cap', () => {
    expect(capHidesLoad(null)).toBe(false)
  })

  it('is true for a cap slower than the slowness threshold Auto uses', () => {
    expect(capHidesLoad(QUALITY_PROFILES.saver.frameCapFps)).toBe(true)
    expect(capHidesLoad(30)).toBe(true)
  })

  it('is false for a cap well above it, so Auto can still step a slow machine down', () => {
    expect(capHidesLoad(QUALITY_PROFILES.balanced.frameCapFps)).toBe(false)
    expect(capHidesLoad(120)).toBe(false)
  })
})
