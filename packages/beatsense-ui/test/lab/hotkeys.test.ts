import { describe, expect, it } from 'vitest'

import { labelForKey, type KeyPress } from '../../lab/recording/hotkeys'
import { LABEL_INFO, LABEL_KINDS } from '../../lab/recording/labels'

const press = (key: string, extra: Partial<KeyPress> = {}): KeyPress => ({ key, ctrlKey: false, metaKey: false, altKey: false, repeat: false, ...extra })

describe('labelForKey', () => {
  it('maps every label kind to its own key', () => {
    LABEL_KINDS.forEach((kind) => expect(labelForKey(press(LABEL_INFO[kind].key))).toBe(kind))
    expect(new Set(LABEL_KINDS.map((kind) => LABEL_INFO[kind].key)).size).toBe(LABEL_KINDS.length)
  })

  it('puts the drums on Q W E R and the song labels on 1 to 5', () => {
    expect(['q', 'w', 'e', 'r'].map((key) => labelForKey(press(key)))).toEqual(['kick', 'snare', 'clap', 'hat'])
    expect(['1', '2', '3', '4', '5'].map((key) => labelForKey(press(key)))).toEqual(['drop', 'buildup', 'breakdown', 'riserStart', 'riserEnd'])
  })

  it('takes upper case too, so caps lock or shift does not turn the hotkeys off', () => {
    expect(labelForKey(press('Q'))).toBe('kick')
  })

  it('ignores held keys, modifiers, typing in a field and unmapped keys', () => {
    expect(labelForKey(press('q', { repeat: true }))).toBeNull()
    expect(labelForKey(press('w', { ctrlKey: true }))).toBeNull()
    expect(labelForKey(press('w', { metaKey: true }))).toBeNull()
    expect(labelForKey(press('1', { altKey: true }))).toBeNull()
    expect(labelForKey(press('q', { targetTag: 'input' }))).toBeNull()
    expect(labelForKey(press('q', { targetTag: 'BUTTON' }))).toBe('kick')
    expect(labelForKey(press('k'))).toBeNull()
    expect(labelForKey(press('6'))).toBeNull()
    expect(labelForKey(press(' '))).toBeNull()
  })
})
