import { describe, it, expect } from 'vitest'
import { mergeLayers } from './mergeLayers'
import { configDefaults } from './configDefaults'

const enabledOf = (l: ReturnType<typeof mergeLayers>): Record<string, boolean> =>
  Object.fromEntries(Object.entries(l.meta).map(([k, m]) => [k, m.enabled.value]))

describe('mergeLayers', () => {
  it('migrates legacy presets without clips', () => {
    const out = mergeLayers(undefined, 0)
    expect(enabledOf(out)).toEqual({ video: false, fractal: false, orbit: true, logo: false })
    expect(out.order).toEqual(['video', 'fractal', 'orbit', 'logo'])
    expect(out.meta.orbit.opacity.value).toBe(1)
    expect(out.meta.orbit.blendMode).toBe('screen')
    expect(out.meta.fractal.blendMode).toBe('mask')
  })

  it('turns video on for legacy presets with clips', () => {
    expect(enabledOf(mergeLayers(undefined, 2)).video).toBe(true)
    expect(enabledOf(mergeLayers('nope', 2)).video).toBe(true)
  })

  it('repairs order: drops unknown, dedupes, appends missing in default order', () => {
    const out = mergeLayers({ order: ['orbit', 'bogus', 'orbit', 'video'] }, 0)
    expect(out.order).toEqual(['orbit', 'video', 'fractal', 'logo'])
    expect(mergeLayers({ order: 'x' }, 0).order).toEqual(['video', 'fractal', 'orbit', 'logo'])
  })

  it('derives video enabled when loaded layers lack it, and fills missing meta', () => {
    const out = mergeLayers({ order: [], meta: { orbit: { enabled: false } } }, 1)
    expect(out.meta.video.enabled.value).toBe(true)
    expect(out.meta.orbit.enabled.value).toBe(false)
    expect(out.meta.fractal.enabled.value).toBe(false)
  })

  it('leaves loaded layers untouched, merging field by field', () => {
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
      3,
    )
    expect(out.order).toEqual(['logo', 'orbit', 'fractal', 'video'])
    expect(enabledOf(out)).toEqual({ video: false, fractal: true, orbit: true, logo: true })
    expect(out.meta.video.opacity.value).toBe(0.4)
    expect(out.meta.orbit.opacity.value).toBe(0.5)
    expect(out.meta.fractal.opacity.value).toBe(configDefaults.layers.meta.fractal.opacity.value)
  })
})
