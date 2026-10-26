import { describe, expect, it } from 'vitest'

import { RedrawGate } from './redraw-gate'

describe('RedrawGate', () => {
  it('draws the first frame', () => {
    expect(new RedrawGate().shouldDraw({ width: 4, height: 4 }, false)).toBe(true)
  })

  it('skips frames while nothing changed', () => {
    const gate = new RedrawGate()
    const target = { width: 4, height: 4 }
    gate.shouldDraw(target, false)
    expect(gate.shouldDraw(target, false)).toBe(false)
    expect(gate.shouldDraw(target, false)).toBe(false)
  })

  it('draws once after being marked dirty', () => {
    const gate = new RedrawGate()
    const target = { width: 4, height: 4 }
    gate.shouldDraw(target, false)
    gate.markDirty()
    expect(gate.shouldDraw(target, false)).toBe(true)
    expect(gate.shouldDraw(target, false)).toBe(false)
  })

  it('draws every frame while animating, then stops', () => {
    const gate = new RedrawGate()
    const target = { width: 4, height: 4 }
    gate.shouldDraw(target, true)
    expect(gate.shouldDraw(target, true)).toBe(true)
    expect(gate.shouldDraw(target, false)).toBe(false)
  })

  it('draws when the target is resized in place', () => {
    const gate = new RedrawGate()
    const target = { width: 4, height: 4 }
    gate.shouldDraw(target, false)
    target.width = 8
    expect(gate.shouldDraw(target, false)).toBe(true)
    expect(gate.shouldDraw(target, false)).toBe(false)
  })

  it('draws when handed a different target', () => {
    const gate = new RedrawGate()
    gate.shouldDraw({ width: 4, height: 4 }, false)
    expect(gate.shouldDraw({ width: 4, height: 4 }, false)).toBe(true)
  })
})
