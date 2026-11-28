import { describe, expect, it } from 'vitest'

import { configDefaults } from '../../config/configDefaults'
import { EFFECT_KEYS } from '../config/useGalaxyMotion'
import { CAMERA_TAB_SLIDERS, COLOR_TAB_PILLS, EFFECTS_PER_ROW, EFFECTS_TAB_EFFECTS, effectButtonLook } from './menuTabContents'

describe('Effects tab', () => {
  it('leads with the kaleidoscope, then every other effect once in the desktop order', () => {
    expect(EFFECTS_TAB_EFFECTS[0]).toBe('kaleidoscope')
    expect(EFFECTS_TAB_EFFECTS.slice(1)).toEqual([...EFFECT_KEYS])
    expect(new Set(EFFECTS_TAB_EFFECTS).size).toBe(EFFECTS_TAB_EFFECTS.length)
  })

  it('names only effects that are switches in the config', () => {
    EFFECTS_TAB_EFFECTS.forEach((key) => expect(configDefaults.effects[key].type, key).toBe('checkbox'))
  })

  it('wraps six to a row, so today the seven effects take two rows', () => {
    expect(EFFECTS_PER_ROW).toBe(6)
    expect(Math.ceil(EFFECTS_TAB_EFFECTS.length / EFFECTS_PER_ROW)).toBe(2)
  })

  it('outlines a button only when Auto wants the other state', () => {
    expect(effectButtonLook(true, null)).toBe('on')
    expect(effectButtonLook(false, null)).toBe('off')
    expect(effectButtonLook(false, 'on')).toBe('ghost-on')
    expect(effectButtonLook(true, 'off')).toBe('ghost-off')
    // A ghost that agrees with the switch shows nothing.
    expect(effectButtonLook(true, 'on')).toBe('on')
    expect(effectButtonLook(false, 'off')).toBe('off')
  })
})

describe('Color tab', () => {
  it('draws Reverse and Hard Edge as pills, which are switches', () => {
    COLOR_TAB_PILLS.forEach((item) => expect((configDefaults.color as unknown as Record<string, { type: string }>)[item]?.type, item).toBe('checkbox'))
  })
})

describe('Camera tab', () => {
  it('has Sway only: Speed, Rotation and Scale are gestures, and Reverse Lean stays on desktop', () => {
    expect(CAMERA_TAB_SLIDERS).toEqual(['sway'])
    expect(configDefaults.user.sway.type).toBe('slider')
    ;['speed', 'rotationSpeed', 'scaleFactor', 'reverseLean'].forEach((item) => expect(CAMERA_TAB_SLIDERS).not.toContain(item))
  })
})
