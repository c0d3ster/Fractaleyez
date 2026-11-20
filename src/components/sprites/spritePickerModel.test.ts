import { describe, it, expect } from 'vitest'
import { AppConfig } from '../../config/configDefaults'
import { LibraryUpload } from './uploadLibrary'
import { PAGE_SIZE, SpriteTile, builtinTiles, clampPage, pageCount, pageItems, uploadCountLabel, usedByLiveConfig, yoursTiles } from './spritePickerModel'

const upload = (id: string, url: string, kind: LibraryUpload['kind'] = 'sprite'): LibraryUpload => ({ id, url, kind, createdAt: '2026-11-01T00:00:00.000Z' })

const describeTile = (tile: SpriteTile): string => {
  if (tile.type !== 'image') return tile.type
  return `${tile.src}${tile.uploadId ? `#${tile.uploadId}` : ''}${tile.isLogo ? ' (logo)' : ''}`
}

describe('yoursTiles', () => {
  it('puts the upload tile first, then the uploads in the order given', () => {
    const tiles = yoursTiles({ uploads: [upload('2', 'b.png'), upload('1', 'a.png')], logoUrl: undefined, isAdmin: false })
    expect(tiles.map(describeTile)).toEqual(['add', 'b.png#2', 'a.png#1'])
  })

  it('adds @user for admins and a logo tile when the logo is not one of the uploads', () => {
    const tiles = yoursTiles({ uploads: [upload('1', 'a.png')], logoUrl: 'logo.png', isAdmin: true })
    expect(tiles.map(describeTile)).toEqual(['add', 'reference', 'logo.png (logo)', 'a.png#1'])
  })

  it('draws the logo once when it is one of the uploads (the avatar copy)', () => {
    const tiles = yoursTiles({ uploads: [upload('1', 'a.png'), upload('2', 'avatar.png', 'avatar')], logoUrl: 'avatar.png', isAdmin: false })
    expect(tiles.map(describeTile)).toEqual(['add', 'a.png#1', 'avatar.png#2 (logo)'])
  })
})

describe('paging', () => {
  const items = Array.from({ length: PAGE_SIZE * 2 + 3 }, (_, i) => i)

  it('always has at least one page', () => {
    expect(pageCount(0)).toBe(1)
    expect(pageCount(PAGE_SIZE)).toBe(1)
    expect(pageCount(PAGE_SIZE + 1)).toBe(2)
  })

  it('slices a page and shows the last page for one past the end', () => {
    expect(pageItems(items, 0)).toEqual(items.slice(0, PAGE_SIZE))
    expect(pageItems(items, 2)).toEqual(items.slice(PAGE_SIZE * 2))
    expect(pageItems(items, 9)).toEqual(items.slice(PAGE_SIZE * 2))
    expect(clampPage(9, items.length)).toBe(2)
    expect(clampPage(-1, items.length)).toBe(0)
  })

  it('never shows more than two rows', () => {
    expect(PAGE_SIZE).toBe(12)
    expect(builtinTiles(['a.png', 'b.png']).map(describeTile)).toEqual(['a.png', 'b.png'])
  })
})

describe('uploadCountLabel', () => {
  it('shows used over the limit, or infinity when unlimited', () => {
    expect(uploadCountLabel(4, 15)).toBe('4 / 15')
    expect(uploadCountLabel(4, null)).toBe('4 / ∞')
  })
})

describe('usedByLiveConfig', () => {
  const config = (sprites: string[], logo: string[]): Pick<AppConfig, 'particle' | 'logo'> =>
    ({ particle: { sprites: { value: sprites } }, logo: { sprite: { value: logo } } }) as unknown as Pick<AppConfig, 'particle' | 'logo'>

  it('is true when the live particles or logo draw the URL', () => {
    expect(usedByLiveConfig(config(['u.png'], ['x.png']), 'u.png')).toBe(true)
    expect(usedByLiveConfig(config(['x.png'], ['u.png']), 'u.png')).toBe(true)
    expect(usedByLiveConfig(config(['x.png'], ['x.png']), 'u.png')).toBe(false)
    expect(usedByLiveConfig(undefined, 'u.png')).toBe(false)
  })
})
