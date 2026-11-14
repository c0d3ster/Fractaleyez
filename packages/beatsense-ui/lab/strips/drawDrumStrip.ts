import { DRUM_COLORS, drawDrumMark } from 'beatsense-ui'

import type { StripSnapshot } from '../labSession'
import { DRUM_LABEL_KINDS, LABEL_INFO } from '../recording/labels'
import { axisStepMs, drumLanes, formatSecondsAgo, liveView } from '../recording/liveView'
import { timeToX } from '../recording/timeline'
import { AXIS_PX, drawLane, drawMarks, LANE_GAP_PX, shadeBefore } from './stripParts'

// The strip under the Beat HUD, over the same window: a lane per drum. With a session recording, your labels on the top half and the
// model's hits on the bottom half, a pair joined by a line and anything unpaired hollow; with none, the model's hits alone (the variant
// without labels).

const LANE_PX = 15

export const DRUM_STRIP_HEIGHT = DRUM_LABEL_KINDS.length * (LANE_PX + LANE_GAP_PX) + AXIS_PX

const PAIR_COLOR = 'rgba(120, 220, 140, 0.9)'

export const drawDrumStrip = (ctx: CanvasRenderingContext2D, width: number, { nowMs, session, drumHits }: StripSnapshot, windowMs: number): void => {
  const view = liveView(nowMs, windowMs)
  const toX = (t: number): number => timeToX(t, view, width)
  const lanes = drumLanes(session?.labels ?? [], drumHits, view)
  let top = 0
  lanes.forEach(({ kind, labels, hitTimes, comparison }) => {
    drawLane(ctx, width, top, LANE_PX, LABEL_INFO[kind].name)
    const { color } = LABEL_INFO[kind]
    ctx.fillStyle = color
    ctx.strokeStyle = color
    ctx.lineWidth = 1
    // The model's hits in their drum's shape, as the HUDs draw them.
    if (!session) {
      hitTimes.forEach((t) => drawDrumMark(ctx, kind, toX(t), top + LANE_PX / 2, 7))
      top += LANE_PX + LANE_GAP_PX
      return
    }
    const mid = top + LANE_PX / 2
    const hitY = top + LANE_PX - 4
    const missed = new Set(comparison.missedLabelIds)
    const extra = new Set(comparison.extraHitTimes)
    ctx.strokeStyle = PAIR_COLOR
    ctx.lineWidth = 1.5
    comparison.matches.forEach(({ labelT, hitT }) => {
      ctx.beginPath()
      ctx.moveTo(toX(labelT), mid)
      ctx.lineTo(toX(hitT), hitY)
      ctx.stroke()
    })
    ctx.strokeStyle = color
    ctx.lineWidth = 1
    labels.forEach(({ id, t }) => {
      const x = Math.round(toX(t))
      if (missed.has(id)) ctx.strokeRect(x - 1.5, top + 1.5, 4, mid - top - 2)
      else ctx.fillRect(x - 1, top + 1, 4, mid - top - 1)
    })
    hitTimes.forEach((t) => drawDrumMark(ctx, kind, toX(t), hitY, 6, DRUM_COLORS[kind], extra.has(t) ? 'outline' : 'fill'))
    top += LANE_PX + LANE_GAP_PX
  })
  if (session) shadeBefore(ctx, toX(session.startMs), top)
  const step = axisStepMs(windowMs)
  const agos: number[] = []
  for (let ago = step; ago < windowMs; ago += step) agos.push(ago)
  drawMarks(ctx, width, top, windowMs, agos, formatSecondsAgo)
}
