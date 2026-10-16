import { describe, it, expect } from 'vitest'
import { AppConfig, LayerKey, configDefaults } from './configDefaults'
import { cameraStart, keepDisabledLayerSections, toStoredConfig } from './storedConfig'

const withLayers = (enabled: Record<LayerKey, boolean>, bound = configDefaults.user.cameraBound.value): AppConfig => {
  const config = structuredClone(configDefaults)
  ;(Object.keys(enabled) as LayerKey[]).forEach((key) => {
    config.layers.meta[key].enabled.value = enabled[key]
  })
  config.user.cameraBound.value = bound
  return config
}

const allOff = { video: false, fractal: false, orbit: false, logo: false }

describe('toStoredConfig', () => {
  it('leaves out the sections of layers that are off', () => {
    const stored = toStoredConfig(withLayers({ ...allOff, orbit: true }))
    expect(Object.keys(stored)).toEqual(['user', 'audio', 'effects', 'color', 'particle', 'orbit', 'layers'])
    expect(stored.layers?.meta?.logo?.enabled).toBe(false)
  })

  it('keeps the sections of layers that are on', () => {
    const stored = toStoredConfig(withLayers({ video: true, fractal: true, orbit: false, logo: true }))
    expect(stored.video).toBeDefined()
    expect(stored.fractal).toBeDefined()
    expect(stored.logo).toBeDefined()
    expect(stored.orbit).toBeUndefined()
    expect(stored.particle).toBeUndefined()
  })

  it('stores no camera when it is centered or Sway is 0', () => {
    expect(toStoredConfig(withLayers(allOff, 200), { x: 0, y: 0 }).user).not.toHaveProperty('cameraX')
    expect(toStoredConfig(withLayers(allOff, 0), { x: 50, y: 20 }).user).not.toHaveProperty('cameraX')
    expect(toStoredConfig(withLayers(allOff, 200)).user).not.toHaveProperty('cameraX')
  })

  it('stores an off-center camera inside user, rounded and held within Sway', () => {
    const { user } = toStoredConfig(withLayers(allOff, 200), { x: 80.6, y: -900 })
    expect(user).toMatchObject({ cameraX: 81, cameraY: -200 })
  })
})

describe('cameraStart', () => {
  it('centers when the preset has no camera', () => {
    expect(cameraStart(undefined, 200)).toEqual({ x: 0, y: 0 })
    expect(cameraStart({ speed: 2 }, 200)).toEqual({ x: 0, y: 0 })
    expect(cameraStart({ cameraX: 'a', cameraY: NaN }, 200)).toEqual({ x: 0, y: 0 })
  })

  it('reads cameraX/cameraY and keeps them inside Sway', () => {
    expect(cameraStart({ cameraX: 120, cameraY: -40 }, 200)).toEqual({ x: 120, y: -40 })
    expect(cameraStart({ cameraX: 900, cameraY: -900 }, 200)).toEqual({ x: 200, y: -200 })
    expect(cameraStart({ cameraX: 120 }, 200)).toEqual({ x: 120, y: 0 })
  })
})

describe('keepDisabledLayerSections', () => {
  const previous = withLayers({ video: true, fractal: true, orbit: true, logo: true })
  previous.fractal.tour.value = 77
  previous.orbit.a.value = 9
  previous.particle.particleSize.value = 321
  previous.logo.size.value = 1.5

  it('carries the previous values for an off layer the preset left out', () => {
    const next = withLayers({ video: false, fractal: false, orbit: false, logo: false })
    const out = keepDisabledLayerSections(next, { user: {}, layers: {} }, previous)
    expect(out.fractal.tour.value).toBe(77)
    expect(out.orbit.a.value).toBe(9)
    expect(out.particle.particleSize.value).toBe(321)
    expect(out.logo.size.value).toBe(1.5)
    expect(out.layers.meta.fractal.enabled.value).toBe(false)
  })

  it('uses the preset own values when it stores the section', () => {
    const next = withLayers({ video: false, fractal: false, orbit: false, logo: false })
    next.fractal.tour.value = 10
    const out = keepDisabledLayerSections(next, { fractal: { tour: 10 } }, previous)
    expect(out.fractal.tour.value).toBe(10)
  })

  it('leaves an enabled layer on defaults when the preset omits it', () => {
    const next = withLayers({ video: false, fractal: true, orbit: false, logo: false })
    const out = keepDisabledLayerSections(next, {}, previous)
    expect(out.fractal.tour.value).toBe(configDefaults.fractal.tour.value)
  })
})
