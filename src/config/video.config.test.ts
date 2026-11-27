import { describe, expect, it } from 'vitest'
import { clipUrl } from './video.config'

describe('clipUrl', () => {
  it('serves the lighter encode of a clip that has one', () => {
    expect(clipUrl('galaxy.mp4', false)).toBe('galaxy-1080.mp4')
  })

  it('serves the original when full resolution is asked for', () => {
    expect(clipUrl('galaxy.mp4', true)).toBe('galaxy.mp4')
  })

  it('leaves clips without a lighter encode alone', () => {
    expect(clipUrl('earth.mp4', false)).toBe('earth.mp4')
  })
})
