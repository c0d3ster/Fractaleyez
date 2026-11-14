import type { DrumKind } from 'beatsense'

import { compareDrum, MATCH_AFTER_MS, MATCH_BEFORE_MS, median, type DrumComparison } from './compareDrums'
import { DRUM_LABEL_KINDS, type DrumLabelKind, type Label } from './labels'
import type { DrumDetection } from './sessionFile'
import type { View } from './timeline'

// The lab's live comparison strip: the last few seconds of your labels against the model's, scrolling as the session records.

/**
 * How much the strip shows until the Beat HUD says otherwise: its default view (a couple of bars at 120 BPM). The strip follows the Beat
 * HUD's zoom, so the two show the same window.
 */
export const LIVE_WINDOW_MS = 6000

const AXIS_STEPS_MS = [250, 500, 1000, 2000, 5000]

/** The axis step for a window: the smallest round step that gives at most `maxTicks` marks (1 s at 6 s, 2 s at 16 s, 250 ms at 2 s). */
export const axisStepMs = (windowMs: number, maxTicks: number = 10): number =>
  AXIS_STEPS_MS.find((step) => windowMs / step <= maxTicks) ?? AXIS_STEPS_MS[AXIS_STEPS_MS.length - 1]!

/** A mark's text, seconds before now: -3s, -1.5s, -0.25s, or now. */
export const formatSecondsAgo = (agoMs: number): string => {
  const seconds = Math.round(agoMs / 10) / 100
  return seconds <= 0 ? 'now' : `-${seconds}s`
}

/** The window ending at `nowMs`. */
export const liveView = (nowMs: number, windowMs: number = LIVE_WINDOW_MS): View => ({ startMs: nowMs - windowMs, endMs: nowMs })

/** The items with a time inside [fromMs, toMs]. */
export const between = <T extends { t: number }>(items: readonly T[], fromMs: number, toMs: number): T[] =>
  items.filter(({ t }) => t >= fromMs && t <= toMs)

export type DrumLane = {
  kind: DrumLabelKind
  labels: Label[]
  hitTimes: number[]
  comparison: DrumComparison
}

/**
 * One lane per drum with what falls in the window and how it pairs. The pairing looks a match window past each edge, so a pair that
 * straddles the edge does not flicker between paired and not as it scrolls.
 */
export const drumLanes = (labels: readonly Label[], hits: readonly DrumDetection[], view: View): DrumLane[] => {
  const from = view.startMs - MATCH_BEFORE_MS - MATCH_AFTER_MS
  const to = view.endMs + MATCH_BEFORE_MS
  return DRUM_LABEL_KINDS.map((kind) => {
    const laneLabels = between(labels.filter((label) => label.kind === kind), from, to)
    const hitTimes = between(hits.filter((hit) => hit.kind === (kind satisfies DrumKind)), from, to).map(({ t }) => t)
    return { kind, labels: laneLabels, hitTimes, comparison: compareDrum(laneLabels, hitTimes) }
  })
}

export type DrumTally = { labels: number; hits: number; matched: number }

export type SessionTally = {
  drums: Record<DrumLabelKind, DrumTally>
  /** The median of label time minus hit time over every pair, ms: how far behind the model you label. Null before a pair. */
  medianOffsetMs: number | null
  pairs: number
}

/** The whole session so far, per drum: your labels, the model's hits and how many paired. */
export const tallySession = (labels: readonly Label[], hits: readonly DrumDetection[]): SessionTally => {
  const offsets: number[] = []
  const drums = Object.fromEntries(DRUM_LABEL_KINDS.map((kind) => {
    const kindLabels = labels.filter((label) => label.kind === kind)
    const hitTimes = hits.filter((hit) => hit.kind === kind).map(({ t }) => t)
    const { matches } = compareDrum(kindLabels, hitTimes)
    matches.forEach(({ offsetMs }) => offsets.push(offsetMs))
    return [kind, { labels: kindLabels.length, hits: hitTimes.length, matched: matches.length }]
  })) as Record<DrumLabelKind, DrumTally>
  return { drums, medianOffsetMs: median(offsets), pairs: offsets.length }
}

export type RiserSpan = { startMs: number; endMs: number | null }

/** Your risers: each start up to the next end (an end with no start before it is dropped; a start not yet ended is open, null). */
export const riserSpans = (labels: readonly Label[]): RiserSpan[] => {
  const spans: RiserSpan[] = []
  labels.forEach(({ kind, t }) => {
    const open = spans[spans.length - 1]
    if (kind === 'riserStart') {
      if (open && open.endMs === null) return
      spans.push({ startMs: t, endMs: null })
    } else if (kind === 'riserEnd' && open && open.endMs === null) {
      open.endMs = t
    }
  })
  return spans
}
