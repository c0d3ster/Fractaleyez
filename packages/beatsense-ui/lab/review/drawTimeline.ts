import { DRUM_KINDS, ONSET_BANDS, type DrumKind, type FrameReading } from 'beatsense'

import { bandColor, RISER_COLOR, SECTION_COLORS, SWEEP_COLOR } from '../colors'
import { LABEL_INFO, type Label } from '../recording/labels'
import type { DrumDetection } from '../recording/sessionFile'
import { columnRanges, formatTime, timeTicks, timeToX, type BeatMark, type ColumnRange, type SectionRun, type View } from '../recording/timeline'

// Draws a session on the review canvas: one lane per HUD timeline (the sections, the five band levels, the beats, the drum model's hits,
// the tempo, the riser and the sweep), the labels as lines through every lane with a tag on top, and the time axis.

/** Room on the left for the lane names, CSS px. */
export const GUTTER_PX = 72

type LaneKind = 'labels' | 'section' | 'level' | 'beats' | 'drum' | 'bpm' | 'riser' | 'sweep' | 'axis'

type Lane = { kind: LaneKind; name: string; height: number; band?: number; drum?: DrumKind }

const LANES: Lane[] = [
  { kind: 'labels', name: 'Labels', height: 22 },
  { kind: 'section', name: 'Section', height: 16 },
  ...ONSET_BANDS.map((band, b): Lane => ({ kind: 'level', name: band.label, height: 34, band: b })),
  { kind: 'beats', name: 'Beats', height: 18 },
  ...DRUM_KINDS.map((drum): Lane => ({ kind: 'drum', name: drum, height: 14, drum })),
  { kind: 'bpm', name: 'BPM', height: 40 },
  { kind: 'riser', name: 'Riser', height: 34 },
  { kind: 'sweep', name: 'Sweep', height: 34 },
  { kind: 'axis', name: '', height: 20 },
]

const LANE_GAP_PX = 3

export const TIMELINE_HEIGHT = LANES.reduce((sum, { height }) => sum + height + LANE_GAP_PX, 0)

const DRUM_COLORS: Record<DrumKind, string> = {
  kick: LABEL_INFO.kick.color,
  hat: LABEL_INFO.hat.color,
  snare: LABEL_INFO.snare.color,
  clap: LABEL_INFO.clap.color,
}

/** What a draw needs, all precomputed per file except the window. */
export type TimelineData = {
  originMs: number
  frames: readonly FrameReading[]
  runs: readonly SectionRun[]
  beats: readonly BeatMark[]
  drumHits: readonly DrumDetection[]
  levelPeaks: readonly number[]
  bpmRange: { min: number; max: number }
}

export type DrawState = {
  view: View
  labels: readonly Label[]
  selectedId: number | null
  /** The pointer's time, for the cursor line. */
  cursorMs: number | null
}

// The capture hop: two samples further apart than this (plus a pixel) have a gap between them (no tempo yet), so no line joins them.
const FRAME_MS = 1000 / 60

/**
 * A series as a bar per pixel column from its lowest to its highest value, joined column to column by a line through the middles, so it
 * reads as a line when zoomed in past one frame per pixel and shows every peak when zoomed out.
 */
const drawSeries = (
  ctx: CanvasRenderingContext2D, columns: ReadonlyArray<ColumnRange | null>, top: number, height: number, scale: (v: number) => number, color: string,
  msPerPx: number,
): void => {
  const maxGapPx = (2 * FRAME_MS) / msPerPx + 1
  const yOf = (v: number): number => top + height - scale(v) * height
  ctx.fillStyle = color
  ctx.strokeStyle = color
  ctx.lineWidth = 1
  ctx.beginPath()
  let last: { x: number; y: number } | null = null
  columns.forEach((range, column) => {
    if (!range) return
    const x = GUTTER_PX + column + 0.5
    const yMax = yOf(range.max)
    const yMin = yOf(range.min)
    ctx.fillRect(GUTTER_PX + column, yMax, 1, Math.max(1, yMin - yMax))
    const y = (yMax + yMin) / 2
    if (last && x - last.x <= maxGapPx) {
      ctx.moveTo(last.x, last.y)
      ctx.lineTo(x, y)
    }
    last = { x, y }
  })
  ctx.stroke()
}

const unit = (v: number): number => Math.min(1, Math.max(0, v))

/** Draws everything at `width` by TIMELINE_HEIGHT CSS px; the context is already scaled for the device pixel ratio. */
export const drawTimeline = (ctx: CanvasRenderingContext2D, width: number, data: TimelineData, { view, labels, selectedId, cursorMs }: DrawState): void => {
  const plotWidth = Math.max(1, width - GUTTER_PX)
  const toX = (t: number): number => GUTTER_PX + timeToX(t, view, plotWidth)
  const visible = (t: number): boolean => t >= view.startMs && t <= view.endMs
  const msPerPx = (view.endMs - view.startMs) / plotWidth
  ctx.clearRect(0, 0, width, TIMELINE_HEIGHT)
  ctx.font = '11px system-ui, sans-serif'
  ctx.textBaseline = 'middle'

  let top = 0
  LANES.forEach((lane) => {
    const { kind, name, height } = lane
    if (kind !== 'axis' && kind !== 'labels') {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.03)'
      ctx.fillRect(GUTTER_PX, top, plotWidth, height)
    }
    ctx.fillStyle = '#888'
    ctx.textAlign = 'left'
    ctx.fillText(name, 4, top + height / 2)

    if (kind === 'section') {
      data.runs.forEach(({ section, startMs, endMs }) => {
        if (endMs < view.startMs || startMs > view.endMs) return
        const x0 = Math.max(GUTTER_PX, toX(startMs))
        const x1 = Math.min(width, toX(endMs))
        ctx.fillStyle = SECTION_COLORS[section]
        ctx.fillRect(x0, top, x1 - x0, height)
        if (x1 - x0 > 44) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
          ctx.fillText(section, x0 + 4, top + height / 2)
        }
      })
    } else if (kind === 'level' && lane.band !== undefined) {
      const band = lane.band
      const peak = data.levelPeaks[band] || 1
      const columns = columnRanges(data.frames, ({ levels }) => levels[band] ?? 0, view, plotWidth)
      drawSeries(ctx, columns, top, height, (v) => unit(v / peak), bandColor(band, 62), msPerPx)
    } else if (kind === 'beats') {
      data.beats.forEach(({ t, band }) => {
        if (!visible(t)) return
        ctx.fillStyle = band === null ? '#ccc' : bandColor(band, 65)
        ctx.fillRect(Math.round(toX(t)), top + 2, 2, height - 4)
      })
    } else if (kind === 'drum' && lane.drum) {
      const drum = lane.drum
      ctx.fillStyle = DRUM_COLORS[drum]
      data.drumHits.forEach(({ kind: hit, t }) => {
        if (hit !== drum || !visible(t)) return
        ctx.beginPath()
        ctx.arc(toX(t), top + height / 2, 3.5, 0, Math.PI * 2)
        ctx.fill()
      })
    } else if (kind === 'bpm') {
      const { min, max } = data.bpmRange
      const columns = columnRanges(data.frames, ({ bpm }) => bpm, view, plotWidth)
      drawSeries(ctx, columns, top, height, (v) => unit((v - min) / (max - min || 1)), 'rgba(220, 220, 220, 0.8)', msPerPx)
      ctx.textAlign = 'right'
      ctx.fillStyle = '#666'
      ctx.fillText(`${Math.round(max)}`, GUTTER_PX - 4, top + 6)
      ctx.fillText(`${Math.round(min)}`, GUTTER_PX - 4, top + height - 6)
    } else if (kind === 'riser' || kind === 'sweep') {
      const columns = columnRanges(data.frames, (frame) => frame[kind], view, plotWidth)
      drawSeries(ctx, columns, top, height, unit, kind === 'riser' ? RISER_COLOR : SWEEP_COLOR, msPerPx)
    } else if (kind === 'axis') {
      ctx.textAlign = 'center'
      ctx.fillStyle = '#888'
      const precise = view.endMs - view.startMs < 4000
      timeTicks(view, plotWidth, data.originMs).forEach((t) => {
        const x = toX(t)
        ctx.fillRect(x, top, 1, 4)
        ctx.fillText(formatTime(t - data.originMs, precise), x, top + 12)
      })
    }
    top += height + LANE_GAP_PX
  })

  // The labels on top of every lane: a line, its tag in the label lane, the selected one brighter and wider.
  const plotBottom = TIMELINE_HEIGHT - LANES[LANES.length - 1]!.height - LANE_GAP_PX
  ctx.textAlign = 'left'
  labels.forEach(({ id, kind, t }) => {
    if (!visible(t)) return
    const x = Math.round(toX(t))
    const { color, short } = LABEL_INFO[kind]
    const selected = id === selectedId
    ctx.globalAlpha = selected ? 1 : 0.7
    ctx.fillStyle = color
    ctx.fillRect(x - (selected ? 1 : 0), 0, selected ? 3 : 1, plotBottom)
    const tagWidth = ctx.measureText(short).width + 8
    ctx.fillRect(x, 2, tagWidth, 16)
    ctx.fillStyle = '#111'
    ctx.fillText(short, x + 4, 10)
    if (selected) {
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1.5
      ctx.strokeRect(x + 0.5, 2.5, tagWidth - 1, 15)
    }
  })
  ctx.globalAlpha = 1

  if (cursorMs !== null && visible(cursorMs)) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)'
    ctx.fillRect(Math.round(toX(cursorMs)), 0, 1, plotBottom)
  }
}
