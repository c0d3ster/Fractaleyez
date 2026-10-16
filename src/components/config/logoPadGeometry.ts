import { logoConfig } from '../../config/logo.config'

/** What the logo pad draws and edits. `x`/`y` are the logo's center across the screen and `focusX`/`focusY` the zoom point across the image, all 0..1 with y down. `size` is the logo's height as a fraction of the screen's. */
export type LogoPadState = { x: number, y: number, focusX: number, focusY: number, size: number }

/** The pad's size in pixels, which turns fractions of its height into fractions of its width. */
export type PadSize = { width: number, height: number }

export type PadSpot = { x: number, y: number }

export type LogoPadTarget = 'focus' | 'logo' | 'empty'

const FOCUS_HIT_RADIUS_PX = 12

const clamp = (value: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, value))

/** The logo's footprint on the pad as fractions of the pad's width and height. It is square, like the image's frame. */
const footprint = ({ size }: LogoPadState, pad: PadSize): { width: number, height: number } => ({
  width: size * pad.height / pad.width,
  height: size,
})

/** Where the zoom point sits on the pad, as fractions of it. */
export const focusSpot = (state: LogoPadState, pad: PadSize): PadSpot => {
  const { width, height } = footprint(state, pad)
  return { x: state.x + (state.focusX - 0.5) * width, y: state.y + (state.focusY - 0.5) * height }
}

/** What a press at `spot` grabs: the zoom point (only while Zoom is on), the logo's body, or neither. */
export const hitTest = (spot: PadSpot, state: LogoPadState, pad: PadSize, zoomOn: boolean): LogoPadTarget => {
  if (zoomOn) {
    const focus = focusSpot(state, pad)
    if (Math.hypot((spot.x - focus.x) * pad.width, (spot.y - focus.y) * pad.height) <= FOCUS_HIT_RADIUS_PX) return 'focus'
  }
  const { width, height } = footprint(state, pad)
  const inside = Math.abs(spot.x - state.x) <= width / 2 && Math.abs(spot.y - state.y) <= height / 2
  return inside ? 'logo' : 'empty'
}

/** The logo's new center for a pointer at `spot` held at `grab` (center minus pointer when pressed; zero snaps the center to the pointer), limited to the configured range. */
export const moveLogo = (spot: PadSpot, grab: PadSpot): PadSpot => ({
  x: clamp(spot.x + grab.x, logoConfig.positionX_MIN, logoConfig.positionX_MAX),
  y: clamp(spot.y + grab.y, logoConfig.positionY_MIN, logoConfig.positionY_MAX),
})

/** The zoom point for a pointer at `spot` held at `grab` (zoom spot minus pointer when pressed), kept inside the image. */
export const moveFocus = (spot: PadSpot, grab: PadSpot, state: LogoPadState, pad: PadSize): PadSpot => {
  const { width, height } = footprint(state, pad)
  return {
    x: clamp(0.5 + (spot.x + grab.x - state.x) / width, logoConfig.focusX_MIN, logoConfig.focusX_MAX),
    y: clamp(0.5 + (spot.y + grab.y - state.y) / height, logoConfig.focusY_MIN, logoConfig.focusY_MAX),
  }
}
