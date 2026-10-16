import { describe, expect, it } from 'vitest'

import { focusSpot, hitTest, LogoPadState, moveFocus, moveLogo, PadSize } from './logoPadGeometry'

const pad: PadSize = { width: 300, height: 200 }
const state: LogoPadState = { x: 0.5, y: 0.5, focusX: 0.5, focusY: 0.5, size: 0.5 } // 100px square, centered

describe('focusSpot', () => {
  it('is the logo center at the middle of the image', () => {
    expect(focusSpot(state, pad)).toEqual({ x: 0.5, y: 0.5 })
  })

  it('moves with the logo and scales with its size', () => {
    const spot = focusSpot({ ...state, x: 0.2, y: 0.3, focusX: 1, focusY: 0 }, pad)
    expect(spot.x).toBeCloseTo(0.2 + 0.5 * (100 / 300))
    expect(spot.y).toBeCloseTo(0.3 - 0.5 * 0.5)
  })
})

describe('hitTest', () => {
  it('grabs the zoom point first when Zoom is on', () => {
    expect(hitTest({ x: 0.5, y: 0.5 }, state, pad, true)).toBe('focus')
  })

  it('grabs the logo body when Zoom is off, even over the zoom point', () => {
    expect(hitTest({ x: 0.5, y: 0.5 }, state, pad, false)).toBe('logo')
  })

  it('grabs the body away from the zoom point', () => {
    expect(hitTest({ x: 0.6, y: 0.6 }, state, pad, true)).toBe('logo')
  })

  it('finds empty pad outside the logo', () => {
    expect(hitTest({ x: 0.95, y: 0.05 }, state, pad, true)).toBe('empty')
  })
})

describe('moveLogo', () => {
  it('keeps the grab offset', () => {
    expect(moveLogo({ x: 0.6, y: 0.6 }, { x: -0.1, y: 0.05 })).toEqual({ x: 0.5, y: 0.65 })
  })

  it('limits the center to the configured range', () => {
    expect(moveLogo({ x: 1.4, y: -0.3 }, { x: 0, y: 0 })).toEqual({ x: 1, y: 0 })
  })
})

describe('moveFocus', () => {
  it('maps the pointer back to a place in the image', () => {
    const focus = moveFocus({ x: 0.5 + 100 / 300 / 4, y: 0.5 - 0.125 }, { x: 0, y: 0 }, state, pad)
    expect(focus.x).toBeCloseTo(0.75)
    expect(focus.y).toBeCloseTo(0.25)
  })

  it('stays inside the image', () => {
    expect(moveFocus({ x: 0, y: 1 }, { x: 0, y: 0 }, state, pad)).toEqual({ x: 0, y: 1 })
  })
})
