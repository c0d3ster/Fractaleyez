import type { DrumKind } from 'beatsense'

// How the Beat HUD's drum row marks each drum the hit classifier calls: a color and a shape per drum (shape too, so the row reads without
// telling the colors apart), and kick and snare a little lower than hat and clap, so a kick and a hat on the same beat do not stack.

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

/** Where a drum's mark is centered in a row `height` tall from `top`: kick and snare in the lower part, hat and clap in the upper. */
export const drumMarkY = (kind: DrumKind, top: number, height: number): number =>
  top + height * (kind === 'kick' || kind === 'snare' ? 0.64 : 0.36)

/** The canvas calls a mark needs (no arc, so a fake context for the bench and tests needs nothing more than the track already uses). */
export type MarkContext = Pick<CanvasRenderingContext2D, 'beginPath' | 'moveTo' | 'lineTo' | 'closePath' | 'fill' | 'fillRect' | 'fillStyle'>

// The circle is an octagon: round at this size, and drawn with the same calls as the other shapes.
const OCTAGON = Array.from({ length: 8 }, (_, i) => [Math.cos(((i + 0.5) * Math.PI) / 4), Math.sin(((i + 0.5) * Math.PI) / 4)] as const)

/** One mark, `size` across, centered at (x, y), in the drum's color. */
export const drawDrumMark = (ctx: MarkContext, kind: DrumKind, x: number, y: number, size: number): void => {
  const r = size / 2
  ctx.fillStyle = DRUM_COLORS[kind]
  const shape = DRUM_SHAPES[kind]
  if (shape === 'square') {
    // A little smaller than the others, which only fill part of their box.
    const side = size * 0.82
    ctx.fillRect(x - side / 2, y - side / 2, side, side)
    return
  }
  ctx.beginPath()
  if (shape === 'circle') {
    OCTAGON.forEach(([cx, cy], i) => (i === 0 ? ctx.moveTo(x + cx * r, y + cy * r) : ctx.lineTo(x + cx * r, y + cy * r)))
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
  ctx.fill()
}
