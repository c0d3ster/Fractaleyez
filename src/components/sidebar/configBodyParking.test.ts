import { describe, expect, it } from 'vitest'

import { canParkConfigBody, shouldRenderConfigBody } from './configBodyParking'

describe('config body parking', () => {
  it('never parks while the expanded window is closed, whether or not the sidebar is showing', () => {
    ;[null, true, false].forEach((sidebarVisible) => {
      expect(canParkConfigBody(false, sidebarVisible)).toBe(false)
      expect(shouldRenderConfigBody(false, sidebarVisible, true)).toBe(true)
    })
  })

  it('parks when the expanded window is open and the sidebar is not showing', () => {
    expect(canParkConfigBody(true, null)).toBe(true)
    expect(canParkConfigBody(true, false)).toBe(true)
  })

  it('does not park while the sidebar is open, even with the expanded window open', () => {
    expect(canParkConfigBody(true, true)).toBe(false)
    expect(shouldRenderConfigBody(true, true, true)).toBe(true)
  })

  it('keeps rendering until the slide-out has settled', () => {
    expect(shouldRenderConfigBody(true, false, false)).toBe(true)
    expect(shouldRenderConfigBody(true, false, true)).toBe(false)
  })

  it('is back in the render that opens the sidebar again, without waiting for anything', () => {
    expect(shouldRenderConfigBody(true, true, true)).toBe(true)
  })
})
