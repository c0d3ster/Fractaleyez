// The mobile shell's "On-screen controls" setting: how much UI shows over the visual. Gestures work the same in every mode, and a
// long-press opens the menu in every mode.

export const CONTROLS_MODES = ['full', 'limited', 'none'] as const
export type ControlsMode = typeof CONTROLS_MODES[number]

export const CONTROLS_MODE_DEFAULT: ControlsMode = 'full'

export const isControlsMode = (value: unknown): value is ControlsMode =>
  typeof value === 'string' && CONTROLS_MODES.some((mode) => mode === value)

/** The picker's rows (the account sheet), in order. */
export const CONTROLS_MODE_OPTIONS: readonly { mode: ControlsMode; title: string; description: string }[] = [
  { mode: 'full', title: 'Full', description: 'Menu and layer buttons, plus the full control (camera pad, spin dial, sliders) while you gesture. Best for learning.' },
  { mode: 'limited', title: 'Limited', description: 'A small label and number in the corner while you gesture. Long-press to open the menu.' },
  { mode: 'none', title: 'None', description: 'Nothing on screen, ever. Long-press anywhere to open the menu.' },
]

/** In Full, the bar and badge fade after this long without a touch. */
export const CONTROLS_FADE_MS = 3000

export type GestureReadout = 'full' | 'chip' | 'none'

export type ControlsVisibility = {
  /** The bottom bar with the menu, layer and effect buttons (never while a sheet is open: the sheet covers its place). */
  bar: boolean
  /** The account badge, top-right. */
  badge: boolean
  /** Whether the bar and badge fade after `CONTROLS_FADE_MS` without a touch (never while the menu is open). */
  fadeWhenIdle: boolean
  /** What shows during a gesture: the full desktop control, the label and number chip, or nothing. */
  readout: GestureReadout
}

const READOUT: Record<ControlsMode, GestureReadout> = { full: 'full', limited: 'chip', none: 'none' }

/** What the shell shows in `mode`. In Limited and None nothing shows at rest, and the badge comes back while the menu is open so the setting stays reachable. The bar is hidden while a sheet (the menu or the account sheet) is open in every mode, so it never shows faintly through the sheet. */
export const controlsVisibility = (mode: ControlsMode, menuOpen: boolean): ControlsVisibility => {
  const full = mode === 'full'
  return {
    bar: full && !menuOpen,
    badge: full || menuOpen,
    fadeWhenIdle: full && !menuOpen,
    readout: READOUT[mode],
  }
}
