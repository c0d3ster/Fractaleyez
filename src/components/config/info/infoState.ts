// What the info strip is showing, and how it changes. `session` counts hovers, so the strip can tell a new control (which it
// fades to) from the same control's text changing (which it swaps in place).
export type InfoState = { text: string | null; session: number }

export const IDLE_INFO: InfoState = { text: null, session: 0 }

/** A pointer or focus arrived on a control. Focus follows the pointer onto a clicked control with the same text, which is not a new hover. */
export const enterInfo = (previous: InfoState, text: string): InfoState =>
  previous.text === text ? previous : { text, session: previous.session + 1 }

/** The pointer moved over the control it is already on, whose text may have changed (the live numbers in the Performance panel). */
export const updateInfo = (previous: InfoState, text: string): InfoState =>
  previous.text === null || previous.text === text ? previous : { text, session: previous.session }

/** The pointer or focus left the control. */
export const hideInfo = (previous: InfoState): InfoState =>
  previous.text === null ? previous : { text: null, session: previous.session + 1 }
