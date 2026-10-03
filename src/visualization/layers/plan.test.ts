import { describe, expect, it } from 'vitest'

import { configDefaults, LayersConfigSection } from '../../config/configDefaults'
import { planLayers } from './plan'

const makeLayers = (): LayersConfigSection => structuredClone(configDefaults.layers)

describe('planLayers', () => {
  it('lists enabled layers front to back, reversing layers.order', () => {
    const layers = makeLayers()
    layers.order = ['video', 'fractal', 'orbit', 'logo']
    layers.meta.logo.enabled.value = true
    expect(planLayers(layers).map(({ key }) => key)).toEqual(['logo', 'orbit', 'fractal', 'video'])
  })

  it('skips disabled layers', () => {
    const layers = makeLayers()
    expect(planLayers(layers).map(({ key }) => key)).toEqual(['orbit', 'fractal', 'video'])
  })

  it('skips layers at zero opacity', () => {
    const layers = makeLayers()
    layers.meta.fractal.opacity.value = 0
    expect(planLayers(layers).map(({ key }) => key)).toEqual(['orbit', 'video'])
  })

  it('carries each layer opacity', () => {
    const layers = makeLayers()
    layers.meta.orbit.opacity.value = 0.4
    expect(planLayers(layers)[0]).toEqual({ key: 'orbit', opacity: 0.4, blendMode: 'screen' })
  })

  it('carries each layer blend mode: logo overs, orbit screens, fractal and video mask', () => {
    const layers = makeLayers()
    layers.meta.logo.enabled.value = true
    const blends = Object.fromEntries(planLayers(layers).map(({ key, blendMode }) => [key, blendMode]))
    expect(blends).toEqual({ logo: 'over', orbit: 'screen', fractal: 'mask', video: 'mask' })
  })
})

describe('planLayers with effective opacity', () => {
  it('uses the in-flight value instead of the target', () => {
    const layers = makeLayers()
    layers.meta.orbit.enabled.value = false
    expect(planLayers(layers, { orbit: 0.5 })[0]).toEqual({ key: 'orbit', opacity: 0.5, blendMode: 'screen' })
  })

  it('drops a layer once its effective opacity reaches 0', () => {
    expect(planLayers(makeLayers(), { orbit: 0 }).map(({ key }) => key)).toEqual(['fractal', 'video'])
  })
})
