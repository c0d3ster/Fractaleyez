import { agoTicks, formatAgo } from 'beatsense-ui'

import { RISER_COLOR, SECTION_COLORS } from '../colors'
import type { StripSnapshot } from '../labSession'
import { SONG_LABEL_KINDS, type LabelKind } from '../recording/labels'
import { between, liveView, riserSpans } from '../recording/liveView'
import { sectionRuns, timeToX } from '../recording/timeline'
import { AXIS_PX, drawLane, drawMarks, drawTag, LANE_GAP_PX, shadeBefore } from './stripParts'

// The strip under the Section HUD, over the same window: the sections and the riser. With a session recording, your song labels over the
// model's sections and your riser spans behind its riser score; with none, the model's alone (the variant without labels). Its time marks
// are the Section HUD's (agoTicks), so they line up with the ones above.

const SECTION_PX = 26
const RISER_PX = 22

export const SONG_STRIP_HEIGHT = SECTION_PX + LANE_GAP_PX + RISER_PX + LANE_GAP_PX + AXIS_PX

const SONG_LABELS: ReadonlySet<LabelKind> = new Set(SONG_LABEL_KINDS)
const RISER_LABELS: ReadonlySet<LabelKind> = new Set(['riserStart', 'riserEnd'])

export const drawSongStrip = (ctx: CanvasRenderingContext2D, width: number, { nowMs, session, frames }: StripSnapshot, windowMs: number): void => {
  const view = liveView(nowMs, windowMs)
  const toX = (t: number): number => timeToX(t, view, width)
  const labels = session?.labels ?? []
  // Tags are drawn from a little before the window, so one whose line is just off the left edge still shows its name.
  const visibleLabels = between(labels, view.startMs - windowMs / 10, view.endMs)

  // Sections: the model's strip, on the lower half when your tags take the upper.
  let top = 0
  drawLane(ctx, width, top, SECTION_PX, 'Section')
  const stripTop = session ? top + 12 : top
  const stripHeight = session ? SECTION_PX - 12 : SECTION_PX
  ctx.font = '10px system-ui, sans-serif'
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  sectionRuns(frames, nowMs).forEach(({ section, startMs, endMs }) => {
    const x0 = Math.max(0, toX(startMs))
    const x1 = Math.min(width, toX(endMs))
    if (x1 <= x0) return
    ctx.fillStyle = SECTION_COLORS[section]
    ctx.fillRect(x0, stripTop, x1 - x0, stripHeight)
    if (x1 - x0 > 46 && x0 > 50) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
      ctx.fillText(section, x0 + 4, stripTop + stripHeight / 2)
    }
  })
  visibleLabels.filter(({ kind }) => SONG_LABELS.has(kind)).forEach((label) => drawTag(ctx, label, toX(label.t), top, SECTION_PX))
  top += SECTION_PX + LANE_GAP_PX

  // Riser: your spans shaded, the model's score as a line over them.
  drawLane(ctx, width, top, RISER_PX, 'Riser')
  riserSpans(labels).forEach(({ startMs, endMs }) => {
    const x0 = Math.max(0, toX(startMs))
    const x1 = Math.min(width, toX(endMs ?? nowMs))
    if (x1 <= x0) return
    ctx.fillStyle = 'rgba(179, 136, 255, 0.2)'
    ctx.fillRect(x0, top, x1 - x0, RISER_PX)
  })
  ctx.strokeStyle = RISER_COLOR
  ctx.lineWidth = 1.5
  ctx.beginPath()
  frames.forEach(({ t, riser }, i) => {
    const y = top + RISER_PX - 1 - Math.min(1, Math.max(0, riser)) * (RISER_PX - 3)
    if (i === 0) ctx.moveTo(toX(t), y)
    else ctx.lineTo(toX(t), y)
  })
  ctx.stroke()
  visibleLabels.filter(({ kind }) => RISER_LABELS.has(kind)).forEach((label) => drawTag(ctx, label, toX(label.t), top, RISER_PX))
  top += RISER_PX + LANE_GAP_PX

  if (session) shadeBefore(ctx, toX(session.startMs), top)
  drawMarks(ctx, width, top, windowMs, agoTicks(windowMs), formatAgo)
}
