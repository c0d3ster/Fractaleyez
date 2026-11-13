import { LABEL_INFO, LABEL_KINDS, type LabelKind } from './labels'

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

const KIND_BY_KEY: ReadonlyMap<string, LabelKind> = new Map(LABEL_KINDS.map((kind) => [LABEL_INFO[kind].key, kind]))

/**
 * The label a key press adds, or null. A held key repeats, which would stamp a burst of labels, so repeats are ignored; so are presses with
 * a modifier (browser shortcuts) and typing in a field. Shift is allowed, so caps lock does not turn the hotkeys off.
 */
export const labelForKey = ({ key, ctrlKey, metaKey, altKey, repeat, targetTag }: KeyPress): LabelKind | null => {
  if (repeat || ctrlKey || metaKey || altKey) return null
  if (targetTag !== undefined && TYPING_TAGS.has(targetTag.toUpperCase())) return null
  return KIND_BY_KEY.get(key.toLowerCase()) ?? null
}
