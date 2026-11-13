import { describe, expect, it } from 'vitest'

import { labelForKey, type KeyPress } from '../../lab/recording/hotkeys'
import { LABEL_INFO, LABEL_KINDS } from '../../lab/recording/labels'

const press = (key: string, extra: Partial<KeyPress> = {}): KeyPress => ({ key, ctrlKey: false, metaKey: false, altKey: false, repeat: false, ...extra })

describe('labelForKey', () => {
  it('maps every label kind to its own key', () => {
    LABEL_KINDS.forEach((kind) => expect(labelForKey(press(LABEL_INFO[kind].key))).toBe(kind))
    expect(new Set(LABEL_KINDS.map((kind) => LABEL_INFO[kind].key)).size).toBe(LABEL_KINDS.length)
  })

  it('takes upper case too, so caps lock or shift does not turn the hotkeys off', () => {
    expect(labelForKey(press('K'))).toBe('kick')
  })

  it('ignores held keys, modifiers, typing in a field and unmapped keys', () => {
    expect(labelForKey(press('k', { repeat: true }))).toBeNull()
    expect(labelForKey(press('c', { ctrlKey: true }))).toBeNull()
    expect(labelForKey(press('c', { metaKey: true }))).toBeNull()
    expect(labelForKey(press('s', { altKey: true }))).toBeNull()
    expect(labelForKey(press('k', { targetTag: 'input' }))).toBeNull()
    expect(labelForKey(press('k', { targetTag: 'BUTTON' }))).toBe('kick')
    expect(labelForKey(press('q'))).toBeNull()
    expect(labelForKey(press(' '))).toBeNull()
  })
})
