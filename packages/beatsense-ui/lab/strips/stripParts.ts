import type { Label } from '../recording/labels'
import { LABEL_INFO } from '../recording/labels'

// What both strips draw the same way: a lane's background and name, the shade over time before the session, label tags and the time marks.

export const LANE_COLOR = 'rgba(255, 255, 255, 0.04)'
export const LANE_GAP_PX = 2
export const AXIS_PX = 13
const FONT = '10px system-ui, sans-serif'

/** A lane's background, and its name in the corner on a dark patch (it sits over the oldest part of the window). */
export const drawLane = (ctx: CanvasRenderingContext2D, width: number, top: number, height: number, name: string): void => {
  ctx.fillStyle = LANE_COLOR
  ctx.fillRect(0, top, width, height)
  ctx.font = FONT
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  const textWidth = ctx.measureText(name).width
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'
  ctx.fillRect(0, top, textWidth + 8, Math.min(height, 13))
  ctx.fillStyle = '#888'
  ctx.fillText(name, 4, top + Math.min(height, 13) / 2)
}

/** A label's tag (its short name on its color) with a line down `lineHeight`. */
export const drawTag = (ctx: CanvasRenderingContext2D, label: Label, x: number, top: number, lineHeight: number): void => {
  const { color, short } = LABEL_INFO[label.kind]
  ctx.font = FONT
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.fillStyle = color
  ctx.fillRect(Math.round(x), top, ctx.measureText(short).width + 6, 11)
  ctx.fillRect(Math.round(x), top, 2, lineHeight)
  ctx.fillStyle = '#111'
  ctx.fillText(short, Math.round(x) + 3, top + 6)
}

/** Darkens everything left of `x` (time before the session started, which has no labels, so its empty top halves are not misses). */
export const shadeBefore = (ctx: CanvasRenderingContext2D, x: number, height: number): void => {
  if (x <= 0) return
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)'
  ctx.fillRect(0, 0, x, height)
}

/** Time marks along the bottom: a tick at each `ago` before now (the right edge) with its text. */
export const drawMarks = (
  ctx: CanvasRenderingContext2D, width: number, top: number, windowMs: number, agos: readonly number[], format: (ago: number) => string,
): void => {
  ctx.font = FONT
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  ctx.fillStyle = '#666'
  agos.forEach((ago) => {
    const x = Math.round(width - (ago / windowMs) * width)
    ctx.fillRect(x, top, 1, 2)
    if (x > 16 && x < width - 16) ctx.fillText(format(ago), x, top + 8.5)
  })
}
