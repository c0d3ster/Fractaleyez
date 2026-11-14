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
}

const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

const ACTION_BY_KEY: ReadonlyMap<string, LabelAction> = new Map(Object.entries(ACTION_KEYS).map(([action, key]) => [key, action as LabelAction]))

/**
 * The label action a key press asks for, or null. A held key repeats, which would stamp a burst of labels, so repeats are ignored; so are
 * presses with a modifier (browser shortcuts) and typing in a field. Shift is allowed, so caps lock does not turn the hotkeys off.
 */
export const actionForKey = ({ key, ctrlKey, metaKey, altKey, repeat, targetTag }: KeyPress): LabelAction | null => {
  if (repeat || ctrlKey || metaKey || altKey) return null
  if (targetTag !== undefined && TYPING_TAGS.has(targetTag.toUpperCase())) return null
  return ACTION_BY_KEY.get(key.toLowerCase()) ?? null
}
