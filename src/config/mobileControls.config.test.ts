import { describe, expect, it } from 'vitest'

import { CONTROLS_MODE_DEFAULT, CONTROLS_MODE_OPTIONS, CONTROLS_MODES, controlsVisibility, isControlsMode } from './mobileControls.config'

describe('controls mode', () => {
  it('defaults to Full', () => {
    expect(CONTROLS_MODE_DEFAULT).toBe('full')
  })

  it.each(['full', 'limited', 'none'])('accepts %s', (mode) => {
    expect(isControlsMode(mode)).toBe(true)
  })

  it.each(['Full', '', 'minimal', 3, null, undefined])('rejects %s', (mode) => {
    expect(isControlsMode(mode)).toBe(false)
  })

  it('has one picker row per mode, in order', () => {
    expect(CONTROLS_MODE_OPTIONS.map((o) => o.mode)).toEqual([...CONTROLS_MODES])
    expect(CONTROLS_MODE_OPTIONS.map((o) => o.title)).toEqual(['Full', 'Limited', 'None'])
  })
})

describe('controlsVisibility', () => {
  it('shows the bar and badge in Full, fading at rest, with the full readout', () => {
    expect(controlsVisibility('full', false)).toEqual({ bar: true, badge: true, fadeWhenIdle: true, readout: 'full' })
  })

  it('does not fade in Full while the menu is open', () => {
    expect(controlsVisibility('full', true)).toEqual({ bar: true, badge: true, fadeWhenIdle: false, readout: 'full' })
  })

  it.each([['limited', 'chip'], ['none', 'none']] as const)('shows nothing at rest in %s', (mode, readout) => {
    expect(controlsVisibility(mode, false)).toEqual({ bar: false, badge: false, fadeWhenIdle: false, readout })
  })

  it.each(['limited', 'none'] as const)('brings the badge back while the menu is open in %s', (mode) => {
    const visibility = controlsVisibility(mode, true)
    expect(visibility.badge).toBe(true)
    expect(visibility.bar).toBe(false)
  })
})
