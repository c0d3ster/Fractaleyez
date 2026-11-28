import { describe, expect, it } from 'vitest'

import { cameraGaveUp, cameraLine, layerSubTabs, ONE_SLIDER_SETS, resolveOneSliderItem, resolveSubTab, showsSubTabs } from './layerPages'
import { configDefaults } from '../../config/configDefaults'

describe('layer page sub-tabs', () => {
  it('gives each layer its sub-tabs in the designs\' order', () => {
    expect(layerSubTabs('fractal', true)).toEqual(['type', 'shape'])
    expect(layerSubTabs('orbit', true)).toEqual(['shape', 'particles', 'sprites'])
    expect(layerSubTabs('logo', true)).toEqual(['look', 'motion', 'pad'])
    expect(layerSubTabs('video', true)).toEqual([])
  })

  it('drops the fractal Type tab, and with it the sub-tabs, when the Types are off', () => {
    const tabs = layerSubTabs('fractal', false)
    expect(tabs).toEqual(['shape'])
    expect(showsSubTabs(tabs)).toBe(false)
    expect(showsSubTabs(layerSubTabs('fractal', true))).toBe(true)
    expect(showsSubTabs(layerSubTabs('video', true))).toBe(false)
  })

  it('shows the picked sub-tab, or the page\'s first when the page lacks it', () => {
    expect(resolveSubTab(['shape', 'particles', 'sprites'], null)).toBe('shape')
    expect(resolveSubTab(['shape', 'particles', 'sprites'], 'sprites')).toBe('sprites')
    // Picked Type, then the flag turned off: Shape is all there is.
    expect(resolveSubTab(['shape'], 'type')).toBe('shape')
    expect(resolveSubTab([], 'shape')).toBeNull()
  })
})

describe('one-slider sets', () => {
  it('names only slider settings that exist in their section', () => {
    Object.values(ONE_SLIDER_SETS).forEach(({ section, items }) => {
      items.forEach((item) => {
        const config = (configDefaults[section] as Record<string, { type: string }>)[item]
        expect(config?.type, `${section}.${item}`).toBe('slider')
      })
    })
  })

  it('selects the first setting until another is picked', () => {
    const { items } = ONE_SLIDER_SETS.orbitParticles
    expect(resolveOneSliderItem(items, null)).toBe('particlesPerLayer')
    expect(resolveOneSliderItem(items, 'levels')).toBe('levels')
    expect(resolveOneSliderItem(items, 'a')).toBe('particlesPerLayer')
  })
})

describe('camera line', () => {
  const state = (patch: Partial<Parameters<typeof cameraLine>[0]>) => ({ status: 'idle' as const, error: null, facing: null, ...patch })

  it('says what the camera is doing while it is on', () => {
    expect(cameraLine(state({ status: 'starting' }), true)).toBe('Starting the camera…')
    expect(cameraLine(state({ status: 'live', facing: 'environment' }), true)).toBe('Live from the rear camera.')
    expect(cameraLine(state({ status: 'live' }), true)).toBe('Live from the camera.')
    expect(cameraLine(state({ status: 'error', error: 'No camera found, retrying…' }), true)).toBe('No camera found, retrying…')
  })

  it('keeps saying why after a blocked camera turned its switch off', () => {
    const blocked = state({ status: 'error', error: 'Camera access was blocked' })
    expect(cameraGaveUp(blocked)).toBe(true)
    expect(cameraLine(blocked, false)).toBe('Camera access was blocked')
  })

  it('treats a drop it is retrying as still going, and drops its message once off', () => {
    const retrying = state({ status: 'error', error: 'Camera disconnected, reconnecting…' })
    expect(cameraGaveUp(retrying)).toBe(false)
    expect(cameraLine(retrying, false)).toBe('Off. Turn it on to show a camera on the video layer.')
  })
})
