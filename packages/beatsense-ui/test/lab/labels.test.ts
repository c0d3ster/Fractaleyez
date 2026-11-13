import { describe, expect, it } from 'vitest'

import { countLabels, isRiserOpen, labelKindFor, type Label, type LabelKind } from '../../lab/recording/labels'

const labels = (...kinds: LabelKind[]): Label[] => kinds.map((kind, i) => ({ id: i + 1, kind, t: i * 100 }))

describe('the riser toggle', () => {
  it('starts a riser, then ends it, then starts the next', () => {
    expect(labelKindFor('riser', [])).toBe('riserStart')
    expect(labelKindFor('riser', labels('riserStart'))).toBe('riserEnd')
    expect(labelKindFor('riser', labels('riserStart', 'kick', 'drop'))).toBe('riserEnd')
    expect(labelKindFor('riser', labels('riserStart', 'riserEnd'))).toBe('riserStart')
  })

  it('reads open from the newest riser label, so an undone end reopens it', () => {
    expect(isRiserOpen(labels('kick'))).toBe(false)
    expect(isRiserOpen(labels('riserStart', 'riserEnd', 'riserStart', 'hat'))).toBe(true)
  })

  it('passes every other action through as its label', () => {
    expect(labelKindFor('kick', labels('riserStart'))).toBe('kick')
    expect(labelKindFor('outro', [])).toBe('outro')
  })
})

describe('countLabels', () => {
  it('counts every kind, zero for the ones not used', () => {
    expect(countLabels(labels('kick', 'kick', 'intro'))).toMatchObject({ kick: 2, intro: 1, outro: 0, riserEnd: 0 })
  })
})
