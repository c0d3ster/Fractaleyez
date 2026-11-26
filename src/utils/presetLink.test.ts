import { describe, it, expect } from 'vitest'
import type { PackMeta, PresetMeta } from '../components/config/context/ConfigProvider'
import { parsePresetLink, presetLinkFor, resolvePresetLink, toSlug } from './presetLink'

const pack = (name: string, overrides: Partial<PackMeta> = {}): PackMeta => ({
  id: name,
  name,
  slug: toSlug(name),
  isPremium: false,
  isOwn: false,
  isEntitled: false,
  ...overrides,
})

const preset = (name: string, packNames: string[], overrides: Partial<PresetMeta> = {}): PresetMeta => ({
  id: `${name}-id`,
  name,
  label: name,
  pack: packNames[0] ?? '',
  packs: packNames,
  sprite: 'fractaleye.png',
  isOwn: false,
  ...overrides,
})

const packs = [pack('Reddit'), pack('Deep Space', { isPremium: true })]
const presets = [
  preset('Fractal Dive', ['Reddit']),
  preset('Fractal Dive', ['Deep Space']),
  preset('Nebula', ['Deep Space']),
  preset('Nebula Free', ['Deep Space', 'Reddit']),
]

describe('parsePresetLink', () => {
  it('splits and slugifies both halves', () => {
    expect(parsePresetLink('Reddit/Fractal Dive')).toEqual({ packSlug: 'reddit', presetSlug: 'fractal-dive' })
    expect(parsePresetLink(new URLSearchParams('preset=reddit/fractal%20dive').get('preset'))).toEqual({ packSlug: 'reddit', presetSlug: 'fractal-dive' })
  })

  it('rejects anything that is not exactly pack/preset', () => {
    expect(parsePresetLink(null)).toBeNull()
    expect(parsePresetLink('')).toBeNull()
    expect(parsePresetLink('reddit')).toBeNull()
    expect(parsePresetLink('reddit/')).toBeNull()
    expect(parsePresetLink('/fractal-dive')).toBeNull()
    expect(parsePresetLink('a/b/c')).toBeNull()
  })
})

describe('resolvePresetLink', () => {
  it('finds the preset in the named pack', () => {
    expect(resolvePresetLink('reddit/fractal-dive', presets, packs)).toBe(presets[0])
  })

  it('ignores case in both halves', () => {
    expect(resolvePresetLink('REDDIT/Fractal-DIVE', presets, packs)).toBe(presets[0])
  })

  it('picks the preset from the named pack when another pack has the same name', () => {
    const entitled = [pack('Reddit'), pack('Deep Space', { isPremium: true, isEntitled: true })]
    expect(resolvePresetLink('deep-space/fractal-dive', presets, entitled)).toBe(presets[1])
  })

  it('returns null for an unknown pack or preset', () => {
    expect(resolvePresetLink('nope/fractal-dive', presets, packs)).toBeNull()
    expect(resolvePresetLink('reddit/nope', presets, packs)).toBeNull()
  })

  it('does not open a preset that is only in premium packs the viewer cannot use', () => {
    expect(resolvePresetLink('deep-space/nebula', presets, packs)).toBeNull()
  })

  it('opens a premium-pack preset that is also in a free pack', () => {
    expect(resolvePresetLink('deep-space/nebula-free', presets, packs)).toBe(presets[3])
  })

  it('reads the legacy pack field when packs is empty', () => {
    const legacy = preset('Old One', [], { pack: 'Reddit', packs: [] })
    expect(resolvePresetLink('reddit/old-one', [legacy], packs)).toBe(legacy)
  })
})

describe('presetLinkFor', () => {
  it('builds the link on the given origin', () => {
    expect(presetLinkFor('reddit', 'Fractal Dive', 'https://fractaleyez.com')).toBe('https://fractaleyez.com/?preset=reddit/fractal-dive')
  })
})
