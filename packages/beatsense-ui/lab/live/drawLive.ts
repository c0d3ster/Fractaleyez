import { DRUM_KINDS } from 'beatsense'

import { RISER_COLOR, SECTION_COLORS } from '../colors'
import type { LiveSnapshot } from '../labSession'
import { LABEL_INFO, SONG_LABEL_KINDS, type Label, type LabelKind } from '../recording/labels'
import { axisStepMs, between, drumLanes, formatSecondsAgo, liveView, riserSpans } from '../recording/liveView'
import { sectionRuns, timeToX } from '../recording/timeline'

// Draws the live strip: your labels against the model's, the last few seconds, newest on the right. In every lane yours are on top and the
// model's below (the header's legend says so): per drum your labels over its hits, a pair joined by a line; your song labels over its
// sections; your risers over its riser score.

export const LIVE_GUTTER_PX = 64

const DRUM_LANE_PX = 22
const SECTION_LANE_PX = 28
const RISER_LANE_PX = 24
const AXIS_PX = 14
const GAP_PX = 2

export const LIVE_HEIGHT = DRUM_KINDS.length * (DRUM_LANE_PX + GAP_PX) + SECTION_LANE_PX + GAP_PX + RISER_LANE_PX + GAP_PX + AXIS_PX

// A pair is joined by this line; an unpaired label or hit is drawn hollow, a paired one solid.
const PAIR_COLOR = 'rgba(120, 220, 140, 0.9)'
const LANE_COLOR = 'rgba(255, 255, 255, 0.03)'

const SONG_LABELS: ReadonlySet<LabelKind> = new Set(SONG_LABEL_KINDS)

/** Draws `snapshot` over the last `windowMs` (the Beat HUD's view). */
export const drawLive = (ctx: CanvasRenderingContext2D, width: number, { nowMs, startMs, labels, drumHits, frames }: LiveSnapshot, windowMs: number): void => {
  const view = liveView(nowMs, windowMs)
  const plotWidth = Math.max(1, width - LIVE_GUTTER_PX)
  const toX = (t: number): number => LIVE_GUTTER_PX + timeToX(t, view, plotWidth)
  ctx.clearRect(0, 0, width, LIVE_HEIGHT)
  ctx.font = '11px system-ui, sans-serif'
  ctx.textBaseline = 'middle'
  // Anything before the session started is not recorded: shade it, so an empty lane there does not read as a miss.
  const sessionX = Math.max(LIVE_GUTTER_PX, toX(startMs))

  const lane = (y: number, height: number, name: string): void => {
    ctx.fillStyle = LANE_COLOR
    ctx.fillRect(LIVE_GUTTER_PX, y, plotWidth, height)
    ctx.fillStyle = '#888'
    ctx.textAlign = 'left'
    ctx.fillText(name, 4, y + height / 2)
  }

  let top = 0
  drumLanes(labels, drumHits, view).forEach(({ kind, labels: laneLabels, hitTimes, comparison }) => {
    lane(top, DRUM_LANE_PX, LABEL_INFO[kind].name)
    const mid = top + DRUM_LANE_PX / 2
    const { color } = LABEL_INFO[kind]
    const missed = new Set(comparison.missedLabelIds)
    const extra = new Set(comparison.extraHitTimes)
    ctx.save()
    ctx.beginPath()
    ctx.rect(LIVE_GUTTER_PX, top, plotWidth, DRUM_LANE_PX)
    ctx.clip()
    // Pairs first, under the marks.
    ctx.strokeStyle = PAIR_COLOR
    ctx.lineWidth = 1.5
    comparison.matches.forEach(({ labelT, hitT }) => {
      ctx.beginPath()
      ctx.moveTo(toX(labelT), mid - 1)
      ctx.lineTo(toX(hitT), top + DRUM_LANE_PX - 5)
      ctx.stroke()
    })
    ctx.fillStyle = color
    ctx.strokeStyle = color
    ctx.lineWidth = 1
    laneLabels.forEach(({ id, t }) => {
      const x = Math.round(toX(t))
      if (missed.has(id)) ctx.strokeRect(x - 1.5, top + 1.5, 4, mid - top - 2)
      else ctx.fillRect(x - 1, top + 1, 4, mid - top - 1)
    })
    hitTimes.forEach((t) => {
      ctx.beginPath()
      ctx.arc(toX(t), top + DRUM_LANE_PX - 5, extra.has(t) ? 2.5 : 3, 0, Math.PI * 2)
      if (extra.has(t)) ctx.stroke()
      else ctx.fill()
    })
    ctx.restore()
    top += DRUM_LANE_PX + GAP_PX
  })

  // Sections: the model's as a strip on the lower half, your section labels as tags above.
  lane(top, SECTION_LANE_PX, 'Section')
  const stripTop = top + SECTION_LANE_PX / 2 + 1
  sectionRuns(frames, nowMs).forEach(({ section, startMs: from, endMs: to }) => {
    const x0 = Math.max(LIVE_GUTTER_PX, toX(from))
    const x1 = Math.min(width, toX(to))
    if (x1 <= x0) return
    ctx.fillStyle = SECTION_COLORS[section]
    ctx.fillRect(x0, stripTop, x1 - x0, SECTION_LANE_PX / 2 - 2)
    if (x1 - x0 > 50) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
      ctx.textAlign = 'left'
      ctx.fillText(section, x0 + 4, stripTop + SECTION_LANE_PX / 4 - 1)
    }
  })
  const drawTag = (label: Label, y: number): void => {
    const x = Math.round(toX(label.t))
    const { color, short } = LABEL_INFO[label.kind]
    ctx.fillStyle = color
    ctx.fillRect(x, y, ctx.measureText(short).width + 8, 12)
    ctx.fillRect(x, y, 2, SECTION_LANE_PX - 2)
    ctx.fillStyle = '#111'
    ctx.textAlign = 'left'
    ctx.fillText(short, x + 4, y + 6)
  }
  between(labels, view.startMs - 1000, view.endMs).filter(({ kind }) => SONG_LABELS.has(kind)).forEach((label) => drawTag(label, top + 1))
  top += SECTION_LANE_PX + GAP_PX

  // Riser: the model's score as a filled line, your spans shaded behind it with their start and end tags.
  lane(top, RISER_LANE_PX, 'Riser')
  riserSpans(labels).forEach(({ startMs: from, endMs: to }) => {
    const x0 = Math.max(LIVE_GUTTER_PX, toX(from))
    const x1 = Math.min(width, toX(to ?? nowMs))
    if (x1 <= x0) return
    ctx.fillStyle = 'rgba(179, 136, 255, 0.18)'
    ctx.fillRect(x0, top, x1 - x0, RISER_LANE_PX)
  })
  ctx.strokeStyle = RISER_COLOR
  ctx.lineWidth = 1.5
  ctx.beginPath()
  frames.forEach(({ t, riser }, i) => {
    const x = toX(t)
    const y = top + RISER_LANE_PX - Math.min(1, Math.max(0, riser)) * (RISER_LANE_PX - 2)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  ctx.stroke()
  between(labels, view.startMs - 1000, view.endMs).filter(({ kind }) => kind === 'riserStart' || kind === 'riserEnd').forEach((label) => drawTag(label, top + 1))
  top += RISER_LANE_PX + GAP_PX

  // Before the session: shaded over every lane.
  if (sessionX > LIVE_GUTTER_PX) {
    ctx.fillStyle = 'rgba(14, 21, 31, 0.7)'
    ctx.fillRect(LIVE_GUTTER_PX, 0, sessionX - LIVE_GUTTER_PX, top)
  }

  // Seconds ago at round steps from now, fixed while the marks and hits scroll past (as on the Section HUD); the step follows the zoom.
  ctx.fillStyle = '#777'
  ctx.textAlign = 'center'
  const step = axisStepMs(windowMs)
  for (let ago = step; ago < windowMs; ago += step) {
    const x = toX(nowMs - ago)
    ctx.fillRect(Math.round(x), top, 1, 3)
    if (x > LIVE_GUTTER_PX + 14) ctx.fillText(formatSecondsAgo(ago), x, top + 10)
  }
}
