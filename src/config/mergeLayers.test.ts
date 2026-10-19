import { describe, it, expect } from 'vitest'
import { LayerPresence, applyRelativeOrder, mergeLayers, presentLayers } from './mergeLayers'
import { configDefaults } from './configDefaults'

const enabledOf = (l: ReturnType<typeof mergeLayers>): Record<string, boolean> =>
  Object.fromEntries(Object.entries(l.meta).map(([k, m]) => [k, m.enabled.value]))

const none: LayerPresence = { video: false, fractal: false, orbit: false, logo: false }

describe('presentLayers', () => {
  it('reads a layer as included when its sections are stored', () => {
    expect(presentLayers({ orbit: {}, logo: {} }, 0)).toEqual({ video: false, fractal: false, orbit: true, logo: true })
    expect(presentLayers({ particle: {}, fractal: { tour: 3 } }, 0)).toEqual({ video: false, fractal: true, orbit: true, logo: false })
  })

  it('needs clips for video', () => {
    expect(presentLayers({ video: { clips: [] } }, 0).video).toBe(false)
    expect(presentLayers({ video: { clips: ['a.mp4'] } }, 1).video).toBe(true)
  })
})

describe('mergeLayers', () => {
  it('derives enabled from presence when the preset stores no layers section', () => {
    const out = mergeLayers(undefined, { ...none, orbit: true, fractal: true })
    expect(enabledOf(out)).toEqual({ video: false, fractal: true, orbit: true, logo: false })
    expect(out.order).toEqual(['video', 'fractal', 'orbit', 'logo'])
    expect(out.meta.orbit.opacity.value).toBe(1)
    expect(out.meta.orbit.blendMode).toBe('screen')
    expect(out.meta.fractal.blendMode).toBe('mask')
  })

  it('falls back to orbit when a preset includes no layer at all', () => {
    expect(enabledOf(mergeLayers(undefined, none))).toEqual({ video: false, fractal: false, orbit: true, logo: false })
    expect(enabledOf(mergeLayers('nope', none)).orbit).toBe(true)
  })

  it('does not add orbit when another layer is included', () => {
    expect(enabledOf(mergeLayers({}, { ...none, video: true })).orbit).toBe(false)
  })

  it('lets a stored enabled flag from an older preset win over presence', () => {
    const out = mergeLayers({ meta: { orbit: { enabled: false }, logo: { enabled: true } } }, { ...none, orbit: true, video: true })
    expect(enabledOf(out)).toEqual({ video: true, fractal: false, orbit: false, logo: true })
  })

  it('reads opacity and blend mode for a layer, ignoring a bad blend mode', () => {
    const out = mergeLayers(
      { meta: { orbit: { opacity: 0.5, blendMode: 'mask' }, logo: { blendMode: 'nope' } } },
      { ...none, orbit: true, logo: true },
    )
    expect(out.meta.orbit.opacity.value).toBe(0.5)
    expect(out.meta.orbit.blendMode).toBe('mask')
    expect(out.meta.logo.blendMode).toBe(configDefaults.layers.meta.logo.blendMode)
    expect(out.meta.fractal.opacity.value).toBe(configDefaults.layers.meta.fractal.opacity.value)
  })

  it('still reads the older item-object shape', () => {
    const out = mergeLayers(
      {
        order: ['logo', 'orbit', 'fractal', 'video'],
        meta: {
          video: { enabled: { value: false }, opacity: { value: 0.4 } },
          fractal: { enabled: { value: true } },
          orbit: { enabled: { value: true }, opacity: { value: 0.5 }, blendMode: 'mask' },
          logo: { enabled: { value: true } },
        },
      },
      { ...none, video: true },
    )
    expect(out.order).toEqual(['logo', 'orbit', 'fractal', 'video'])
    expect(enabledOf(out)).toEqual({ video: false, fractal: true, orbit: true, logo: true })
    expect(out.meta.video.opacity.value).toBe(0.4)
    expect(out.meta.orbit.opacity.value).toBe(0.5)
  })
})

describe('applyRelativeOrder', () => {
  const base = ['video', 'fractal', 'orbit', 'logo'] as const

  it('reorders the listed layers among the slots they hold, leaving the others in place', () => {
    expect(applyRelativeOrder([...base], ['logo', 'orbit'])).toEqual(['video', 'fractal', 'logo', 'orbit'])
    expect(applyRelativeOrder(['video', 'fractal', 'orbit', 'logo'], ['orbit', 'video'])).toEqual(['orbit', 'fractal', 'video', 'logo'])
  })

  it('replaces the whole order when all layers are listed', () => {
    expect(applyRelativeOrder([...base], ['logo', 'orbit', 'fractal', 'video'])).toEqual(['logo', 'orbit', 'fractal', 'video'])
  })

  it('drops unknown and repeated keys, and keeps the base for anything unusable', () => {
    expect(applyRelativeOrder([...base], ['orbit', 'bogus', 'orbit', 'video'])).toEqual(['orbit', 'fractal', 'video', 'logo'])
    expect(applyRelativeOrder([...base], 'x')).toEqual([...base])
    expect(applyRelativeOrder([...base], [])).toEqual([...base])
  })
})
