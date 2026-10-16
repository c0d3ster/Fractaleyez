import { logoConfig } from '../../config/logo.config'
import { Bounds } from '../../utils/opaqueBounds'

/**
 * What the logo pad draws and edits. `x`/`y` are the center of the logo's image frame across the screen and
 * `focusX`/`focusY` the zoom point across the image, all 0..1 with y down. `size` is the frame's height as a fraction of
 * the screen's and `aspect` the image's width over its height. `bounds` is the visible part of the image inside the frame: the box the pad draws, and the only part the
 * zoom point can be aimed at.
 */
export type LogoPadState = { x: number, y: number, focusX: number, focusY: number, size: number, aspect: number, bounds: Bounds }

/** The pad's size in pixels, which turns fractions of its height into fractions of its width. */
export type PadSize = { width: number, height: number }

export type PadSpot = { x: number, y: number }

export type LogoPadTarget = 'focus' | 'logo' | 'empty'

const FOCUS_HIT_RADIUS_PX = 12

const clamp = (value: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, value))

/** The logo's footprint on the pad as fractions of the pad's width and height: the image's whole frame at its size on screen. */
const footprint = ({ size, aspect }: LogoPadState, pad: PadSize): { width: number, height: number } => ({
  width: size * aspect * pad.height / pad.width,
  height: size,
})

/** Where the zoom point sits on the pad, as fractions of it. */
export const focusSpot = (state: LogoPadState, pad: PadSize): PadSpot => {
  const { width, height } = footprint(state, pad)
  return { x: state.x + (state.focusX - 0.5) * width, y: state.y + (state.focusY - 0.5) * height }
}

/** The image's whole frame on the pad, centered on the logo. */
export const frameRect = (state: LogoPadState, pad: PadSize): { left: number, top: number, width: number, height: number } => {
  const { width, height } = footprint(state, pad)
  return { left: state.x - width / 2, top: state.y - height / 2, width, height }
}

/** The box on the pad that matches what is seen on screen: the visible part of the image, as fractions of the pad. */
export const visibleRect = (state: LogoPadState, pad: PadSize): { left: number, top: number, width: number, height: number } => {
  const { width, height } = footprint(state, pad)
  const { left, top, right, bottom } = state.bounds
  return {
    left: state.x - width / 2 + left * width,
    top: state.y - height / 2 + top * height,
    width: (right - left) * width,
    height: (bottom - top) * height,
  }
}

/** What a press at `spot` grabs: the zoom point (only while Zoom is on), the logo's body, or neither. */
export const hitTest = (spot: PadSpot, state: LogoPadState, pad: PadSize, zoomOn: boolean): LogoPadTarget => {
  if (zoomOn) {
    const focus = focusSpot(state, pad)
    if (Math.hypot((spot.x - focus.x) * pad.width, (spot.y - focus.y) * pad.height) <= FOCUS_HIT_RADIUS_PX) return 'focus'
  }
  const { left, top, width, height } = visibleRect(state, pad)
  const inside = spot.x >= left && spot.x <= left + width && spot.y >= top && spot.y <= top + height
  return inside ? 'logo' : 'empty'
}

/** The logo's new center for a pointer at `spot` held at `grab` (center minus pointer when pressed; zero snaps the center to the pointer), limited to the configured range. */
export const moveLogo = (spot: PadSpot, grab: PadSpot): PadSpot => ({
  x: clamp(spot.x + grab.x, logoConfig.positionX_MIN, logoConfig.positionX_MAX),
  y: clamp(spot.y + grab.y, logoConfig.positionY_MIN, logoConfig.positionY_MAX),
})

/** The zoom point for a pointer at `spot` held at `grab` (zoom spot minus pointer when pressed), kept inside the visible part of the image. */
export const moveFocus = (spot: PadSpot, grab: PadSpot, state: LogoPadState, pad: PadSize): PadSpot => {
  const { width, height } = footprint(state, pad)
  return {
    x: clamp(0.5 + (spot.x + grab.x - state.x) / width, Math.max(logoConfig.focusX_MIN, state.bounds.left), Math.min(logoConfig.focusX_MAX, state.bounds.right)),
    y: clamp(0.5 + (spot.y + grab.y - state.y) / height, Math.max(logoConfig.focusY_MIN, state.bounds.top), Math.min(logoConfig.focusY_MAX, state.bounds.bottom)),
  }
}
