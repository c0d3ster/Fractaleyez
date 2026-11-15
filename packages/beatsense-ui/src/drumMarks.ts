import type { DrumKind } from 'beatsense'

// How the drums are marked, in the Beat HUD's drum row, the Frequency HUD's lights and the lab's comparison strip: a color and a shape per
// drum (shape too, so the marks read without telling the colors apart). In the drum row each drum has its own level, ordered as in drum
// notation and as the Frequency HUD's lights run from low to high: kick at the bottom, then snare, clap, and hat on top. Almost any two
// drums can land together (the snare or clap on 2 and 4 is on top of a kick, a snare and a clap are often layered, closed hats on 16ths land
// on everything), so each needs a level of its own.

export const DRUM_COLORS: Record<DrumKind, string> = {
  kick: '#ff6b6b',
  snare: '#ffd166',
  clap: '#f78fb3',
  hat: '#4ecdc4',
}

export type DrumShape = 'circle' | 'square' | 'triangle' | 'diamond'

export const DRUM_SHAPES: Record<DrumKind, DrumShape> = {
  kick: 'circle',
  snare: 'square',
  clap: 'triangle',
  hat: 'diamond',
}

/** Each drum's level in the drum row, from the bottom. */
export const DRUM_LEVELS: Record<DrumKind, number> = { kick: 0, snare: 1, clap: 2, hat: 3 }

/**
 * Where a drum's mark is centered in a row `height` tall from `top`, for marks `size` across: the four levels evenly from bottom to top
 * (apart by more than a mark, so not overlapping, when the row has room for four marks).
 */
export const drumMarkY = (kind: DrumKind, top: number, height: number, size: number): number => {
  const step = (height - size - 2) / 3
  return top + height - 1 - size / 2 - DRUM_LEVELS[kind] * step
}

/** The canvas calls a mark needs (paths only, so a fake context for the bench and tests needs nothing more than the track already uses). */
export type MarkContext = Pick<CanvasRenderingContext2D, 'beginPath' | 'moveTo' | 'lineTo' | 'closePath' | 'fill' | 'stroke' | 'fillStyle' | 'strokeStyle' | 'lineWidth'>

// The circle is an octagon: round at this size, and drawn with the same calls as the other shapes.
const OCTAGON = Array.from({ length: 8 }, (_, i) => [Math.cos(((i + 0.5) * Math.PI) / 4), Math.sin(((i + 0.5) * Math.PI) / 4)] as const)

/** How a mark is drawn: filled, or as an outline (the lab's comparison strip draws a hit with no matching label that way). */
export type MarkStyle = 'fill' | 'outline'

/** One mark, `size` across, centered at (x, y), in the drum's color (or `color`, e.g. the Frequency HUD's unlit grey). */
export const drawDrumMark = (
  ctx: MarkContext, kind: DrumKind, x: number, y: number, size: number, color: string = DRUM_COLORS[kind], style: MarkStyle = 'fill',
): void => {
  const r = size / 2
  ctx.beginPath()
  const shape = DRUM_SHAPES[kind]
  if (shape === 'circle') {
    OCTAGON.forEach(([cx, cy], i) => (i === 0 ? ctx.moveTo(x + cx * r, y + cy * r) : ctx.lineTo(x + cx * r, y + cy * r)))
  } else if (shape === 'square') {
    // A little smaller than the others, which only fill part of their box.
    const half = r * 0.82
    ctx.moveTo(x - half, y - half)
    ctx.lineTo(x + half, y - half)
    ctx.lineTo(x + half, y + half)
    ctx.lineTo(x - half, y + half)
  } else if (shape === 'triangle') {
    ctx.moveTo(x, y - r)
    ctx.lineTo(x + r, y + r * 0.8)
    ctx.lineTo(x - r, y + r * 0.8)
  } else {
    ctx.moveTo(x, y - r)
    ctx.lineTo(x + r, y)
    ctx.lineTo(x, y + r)
    ctx.lineTo(x - r, y)
  }
  ctx.closePath()
  if (style === 'outline') {
    ctx.strokeStyle = color
    ctx.lineWidth = 1
    ctx.stroke()
  } else {
    ctx.fillStyle = color
    ctx.fill()
  }
}
