import { EFFECT_KEYS } from '../config/useGalaxyMotion'
import type { SwitchGhost } from '../../utils/ghostStore'
import type { EffectIconKey } from './EffectIcons'

// What the menu sheet's Effects, Color and Camera tabs hold (docs/mobile-design/MenuFull.html, ColorTab.html, CameraTab.html). Pure,
// so the order and the choices are tested without a DOM.

/** The Effects tab's dial, in pixels (the desktop's is 10rem). */
export const EFFECTS_DIAL_PX = 100

/** Effect buttons per row of the Effects tab's grid; more wrap onto the next row. */
export const EFFECTS_PER_ROW = 6

/** The Effects tab's buttons: the kaleidoscope first, as on desktop, then the rest in the desktop's order. */
export const EFFECTS_TAB_EFFECTS: readonly EffectIconKey[] = ['kaleidoscope', ...EFFECT_KEYS]

/** How an effect button looks: on or off, with Auto's outline when Auto wants the other (only the kaleidoscope has one). */
export type EffectButtonLook = 'on' | 'off' | 'ghost-on' | 'ghost-off'

export const effectButtonLook = (on: boolean, ghost: SwitchGhost | null): EffectButtonLook => {
  if (ghost === 'on' && !on) return 'ghost-on'
  if (ghost === 'off' && on) return 'ghost-off'
  return on ? 'on' : 'off'
}

/**
 * The Camera tab's one slider. Speed, Rotation and Scale are gestures on the phone (drag, twist, pinch), so they are not repeated
 * here, and Reverse Lean is left to desktop.
 */
export const CAMERA_TAB_SLIDERS: readonly string[] = ['sway']

/** The Color tab's pills, under the sliders. */
export const COLOR_TAB_PILLS: readonly string[] = ['paletteReverse', 'paletteHardEdge']
