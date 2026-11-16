import { ACTION_KEYS, type LabelAction } from './labels'

/** The parts of a KeyboardEvent the hotkeys look at, so they can be tested without a DOM. */
export type KeyPress = {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  repeat: boolean
  /** The focused element's tag name, if any (typing into a field is not a label). */
  targetTag?: string
  /** The focused input's type, when it is an input (a slider or a file picker takes no typing; a text box does). */
  targetType?: string
  /** Whether the focused element is editable text (contenteditable). */
  targetEditable?: boolean
}

const TYPING_TAGS = new Set(['TEXTAREA', 'SELECT'])

/** The input types that take typed text: the keys go to them. A range, file, checkbox or button input takes none, so the hotkeys stay on. */
const TYPING_INPUT_TYPES = new Set(['text', 'search', 'email', 'url', 'tel', 'password', 'number'])

const ACTION_BY_KEY: ReadonlyMap<string, LabelAction> = new Map(Object.entries(ACTION_KEYS).map(([action, key]) => [key, action as LabelAction]))

/** Whether the key press goes to something you type into (a text input, a text area, a select or editable text), not to the hotkeys. */
export const isTyping = ({ targetTag, targetType, targetEditable }: Pick<KeyPress, 'targetTag' | 'targetType' | 'targetEditable'>): boolean => {
  if (targetEditable) return true
  if (targetTag === undefined) return false
  const tag = targetTag.toUpperCase()
  // An input with no type attribute is a text input.
  if (tag === 'INPUT') return TYPING_INPUT_TYPES.has((targetType ?? 'text').toLowerCase())
  return TYPING_TAGS.has(tag)
}

/** A modifier that makes the press a browser or system shortcut (Shift is not one, so caps lock does not turn the hotkeys off). */
const isShortcut = ({ ctrlKey, metaKey, altKey }: KeyPress): boolean => ctrlKey || metaKey || altKey

/**
 * The label action a key press asks for, or null. A held key repeats, which would stamp a burst of labels, so repeats are ignored; so are
 * presses with a modifier (browser shortcuts) and typing in a field. Shift is allowed, so caps lock does not turn the hotkeys off.
 */
export const actionForKey = (press: KeyPress): LabelAction | null => {
  if (press.repeat || isShortcut(press) || isTyping(press)) return null
  return ACTION_BY_KEY.get(press.key.toLowerCase()) ?? null
}

/** Whether the press undoes the newest label: Backspace, not held, with no Ctrl, Cmd or Alt, and not typing in a field. */
export const isUndoKey = (press: KeyPress): boolean => press.key === 'Backspace' && !press.repeat && !isShortcut(press) && !isTyping(press)
