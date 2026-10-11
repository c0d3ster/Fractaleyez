import { describe, it, expect } from 'vitest'
import { resolveUserParticle, resolveUserSprites, restoreUserReference, swapUserReference } from './userReference'

const renderText = (text: string): string => `data:text,${text}`

describe('resolveUserParticle', () => {
  it('prefers the persisted logo over the display name', () => {
    expect(resolveUserParticle({ logoParticle: 'https://r2/logo.png', displayName: 'BeatzMe' }, 'a.png', { renderText }))
      .toBe('https://r2/logo.png')
  })

  it('renders the display name when there is no logo', () => {
    expect(resolveUserParticle({ displayName: ' BeatzMe ' }, 'a.png', { renderText })).toBe('data:text,BeatzMe')
  })

  it('falls to the preset fallback, then the app default, when signed out', () => {
    expect(resolveUserParticle({}, 'a.png', { renderText })).toBe('a.png')
    expect(resolveUserParticle({}, undefined, { renderText })).toBe('fractaleye.png')
  })

  it('skips the name rung when text rendering is unavailable', () => {
    expect(resolveUserParticle({ displayName: 'BeatzMe' }, 'a.png', { renderText: () => '' })).toBe('a.png')
  })
})

describe('resolveUserSprites / restoreUserReference', () => {
  it('leaves lists without the sentinel untouched', () => {
    const sprites = ['a.png', 'b.png']
    expect(resolveUserSprites(sprites, { logoParticle: 'x' })).toEqual({ sprites, reference: null })
  })

  it('keeps the reference, flagged collapsed, when it resolves into the preset fallback', () => {
    expect(resolveUserSprites(['@user', 'b.png'], {}, { renderText }))
      .toEqual({ sprites: ['b.png'], reference: { resolved: 'b.png', collapsed: true } })
  })

  it('round-trips back to the sentinel on save', () => {
    const { sprites, reference } = resolveUserSprites(['@user', 'b.png'], { logoParticle: 'https://r2/logo.png' })
    expect(sprites).toEqual(['https://r2/logo.png', 'b.png'])
    expect(restoreUserReference(sprites, reference)).toEqual(['@user', 'b.png'])
  })

  it('restores the sentinel from a collapsed list on save', () => {
    const { sprites, reference } = resolveUserSprites(['@user', 'b.png'], {})
    expect(restoreUserReference(sprites, reference)).toEqual(['@user', 'b.png'])
  })

  it('swaps a collapsed reference to a late-arriving logo by inserting it, keeping the fallback', () => {
    const { sprites, reference } = resolveUserSprites(['@user', 'b.png'], {})
    if (!reference) throw new Error('expected a reference')
    const swapped = swapUserReference(sprites, reference, 'https://r2/logo.png')
    expect(swapped.sprites).toEqual(['https://r2/logo.png', 'b.png'])
    expect(swapped.reference).toEqual({ resolved: 'https://r2/logo.png', collapsed: false })
    expect(restoreUserReference(swapped.sprites, swapped.reference)).toEqual(['@user', 'b.png'])
  })

  it('swaps an uncollapsed reference back onto the fallback and collapses it', () => {
    const swapped = swapUserReference(['https://r2/logo.png', 'b.png'], { resolved: 'https://r2/logo.png', collapsed: false }, 'b.png')
    expect(swapped).toEqual({ sprites: ['b.png'], reference: { resolved: 'b.png', collapsed: true } })
  })

  it('does not rewrite anything when the preset had no reference', () => {
    expect(restoreUserReference(['https://r2/logo.png'], null)).toEqual(['https://r2/logo.png'])
  })
})
