import { describe, it, expect } from 'vitest'
import { resolveUserParticle, resolveUserSprites, restoreUserReference } from './userReference'

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
    expect(resolveUserSprites(sprites, { logoParticle: 'x' })).toEqual({ sprites, resolved: null })
  })

  it('resolves the sentinel, collapsing into the preset fallback (another sprite in the list) without a mappable value', () => {
    expect(resolveUserSprites(['@user', 'b.png'], {}, { renderText }))
      .toEqual({ sprites: ['b.png'], resolved: null })
  })

  it('round-trips back to the sentinel on save', () => {
    const { sprites, resolved } = resolveUserSprites(['@user', 'b.png'], { logoParticle: 'https://r2/logo.png' })
    expect(sprites).toEqual(['https://r2/logo.png', 'b.png'])
    expect(restoreUserReference(sprites, resolved)).toEqual(['@user', 'b.png'])
  })

  it('does not rewrite anything when the preset had no reference', () => {
    expect(restoreUserReference(['https://r2/logo.png'], null)).toEqual(['https://r2/logo.png'])
  })
})
