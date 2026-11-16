import { describe, expect, it } from 'vitest'

import { actionForKey, isUndoKey, type KeyPress } from '../../lab/recording/hotkeys'
import { ACTION_KEYS, type LabelAction } from '../../lab/recording/labels'

const press = (key: string, extra: Partial<KeyPress> = {}): KeyPress => ({ key, ctrlKey: false, metaKey: false, altKey: false, repeat: false, ...extra })

describe('actionForKey', () => {
  it('gives every action its own key', () => {
    Object.entries(ACTION_KEYS).forEach(([action, key]) => expect(actionForKey(press(key))).toBe(action as LabelAction))
    expect(new Set(Object.values(ACTION_KEYS)).size).toBe(Object.keys(ACTION_KEYS).length)
  })

  it('puts the drums on Q W / A S, the riser on R and the song labels on 1 to 5', () => {
    expect(['q', 'w', 'a', 's', 'r'].map((key) => actionForKey(press(key)))).toEqual(['kick', 'snare', 'clap', 'hat', 'riser'])
    expect(['1', '2', '3', '4', '5'].map((key) => actionForKey(press(key)))).toEqual(['intro', 'buildup', 'drop', 'breakdown', 'outro'])
  })

  it('takes upper case too, so caps lock or shift does not turn the hotkeys off', () => {
    expect(actionForKey(press('Q'))).toBe('kick')
  })

  it('ignores held keys, modifiers, typing in a field and unmapped keys', () => {
    expect(actionForKey(press('q', { repeat: true }))).toBeNull()
    expect(actionForKey(press('w', { ctrlKey: true }))).toBeNull()
    expect(actionForKey(press('w', { metaKey: true }))).toBeNull()
    expect(actionForKey(press('1', { altKey: true }))).toBeNull()
    expect(actionForKey(press('q', { targetTag: 'input' }))).toBeNull()
    expect(actionForKey(press('q', { targetTag: 'BUTTON' }))).toBe('kick')
    expect(actionForKey(press('e'))).toBeNull()
    expect(actionForKey(press('6'))).toBeNull()
    expect(actionForKey(press(' '))).toBeNull()
  })

  it('stays on with a slider, a file picker or a checkbox focused, and goes off in anything you type into', () => {
    const noTyping = ['range', 'file', 'checkbox', 'button', 'radio']
    const typing = ['text', 'search', 'email', 'url', 'tel', 'password', 'number']
    noTyping.forEach((targetType) => expect(actionForKey(press('q', { targetTag: 'INPUT', targetType }))).toBe('kick'))
    typing.forEach((targetType) => expect(actionForKey(press('q', { targetTag: 'INPUT', targetType }))).toBeNull())
    // An input with no type attribute is a text input.
    expect(actionForKey(press('q', { targetTag: 'INPUT' }))).toBeNull()
    expect(actionForKey(press('q', { targetTag: 'TEXTAREA' }))).toBeNull()
    expect(actionForKey(press('q', { targetTag: 'SELECT' }))).toBeNull()
    expect(actionForKey(press('q', { targetTag: 'DIV', targetEditable: true }))).toBeNull()
    expect(actionForKey(press('q', { targetTag: 'DIV', targetEditable: false }))).toBe('kick')
  })
})

describe('isUndoKey', () => {
  it('undoes on a plain Backspace, also with a slider or file picker focused', () => {
    expect(isUndoKey(press('Backspace'))).toBe(true)
    expect(isUndoKey(press('Backspace', { targetTag: 'INPUT', targetType: 'range' }))).toBe(true)
    expect(isUndoKey(press('Backspace', { targetTag: 'INPUT', targetType: 'file' }))).toBe(true)
  })

  it('leaves held keys, shortcuts with Ctrl, Cmd or Alt, and typing alone', () => {
    expect(isUndoKey(press('Backspace', { repeat: true }))).toBe(false)
    expect(isUndoKey(press('Backspace', { ctrlKey: true }))).toBe(false)
    expect(isUndoKey(press('Backspace', { metaKey: true }))).toBe(false)
    expect(isUndoKey(press('Backspace', { altKey: true }))).toBe(false)
    expect(isUndoKey(press('Backspace', { targetTag: 'INPUT', targetType: 'text' }))).toBe(false)
    expect(isUndoKey(press('Backspace', { targetTag: 'TEXTAREA' }))).toBe(false)
    expect(isUndoKey(press('Delete'))).toBe(false)
  })
})
