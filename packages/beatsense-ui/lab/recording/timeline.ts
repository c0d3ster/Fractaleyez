import type { FrameReading, SongSection } from 'beatsense'

import type { TimeBounds } from './labelEdits'

// The review page's plot geometry and the series it draws, kept free of the canvas so it can be tested: the visible time window and its
// zoom and pan, time to pixels and back, a min and max per pixel column for a line series (a 5 minute session is 18000 frames on maybe
// 1500 pixels), the section runs, the beats and the time axis ticks.

/** The visible window, audio clock ms. */
export type View = TimeBounds

/** The shortest window the zoom goes to: a few beats, enough to place a drum label to the frame. */
export const MIN_VIEW_MS = 500

export const timeToX = (t: number, { startMs, endMs }: View, width: number): number => ((t - startMs) / (endMs - startMs)) * width

export const xToTime = (x: number, { startMs, endMs }: View, width: number): number => startMs + (x / width) * (endMs - startMs)

/** The window moved to lie inside the session, keeping its length (or the whole session if it is longer). */
const fit = (startMs: number, spanMs: number, bounds: TimeBounds): View => {
  const total = bounds.endMs - bounds.startMs
  if (spanMs >= total) return { startMs: bounds.startMs, endMs: bounds.endMs }
  const start = Math.min(bounds.endMs - spanMs, Math.max(bounds.startMs, startMs))
  return { startMs: start, endMs: start + spanMs }
}

/** The window zoomed by `factor` (above 1 shows more time) around `anchorMs`, which stays under the pointer. */
export const zoomViewAt = (view: View, anchorMs: number, factor: number, bounds: TimeBounds): View => {
  const span = view.endMs - view.startMs
  const total = Math.max(MIN_VIEW_MS, bounds.endMs - bounds.startMs)
  const next = Math.min(total, Math.max(MIN_VIEW_MS, span * factor))
  const share = span > 0 ? (anchorMs - view.startMs) / span : 0.5
  return fit(anchorMs - share * next, next, bounds)
}

export const panView = (view: View, deltaMs: number, bounds: TimeBounds): View => fit(view.startMs + deltaMs, view.endMs - view.startMs, bounds)

/** The index of the first frame at or after `t` (frames sorted by time); frames.length if none. */
export const frameIndexAt = (frames: readonly FrameReading[], t: number): number => {
  let lo = 0
  let hi = frames.length
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (frames[mid]!.t < t) lo = mid + 1
    else hi = mid
  }
  return lo
}

export type ColumnRange = { min: number; max: number }

/**
 * The lowest and highest value in each pixel column of the window, null where no frame falls (zoomed in past the frame spacing, or a
 * gap) or `value` gives null (no tempo yet). Drawn as a vertical bar per column it shows every peak, which a line through samples would skip.
 */
export const columnRanges = (
  frames: readonly FrameReading[],
  value: (frame: FrameReading) => number | null,
  view: View,
  width: number,
): Array<ColumnRange | null> => {
  const columns: Array<ColumnRange | null> = new Array(Math.max(0, Math.floor(width))).fill(null)
  for (let i = frameIndexAt(frames, view.startMs); i < frames.length; i++) {
    const frame = frames[i]!
    if (frame.t > view.endMs) break
    const v = value(frame)
    if (v === null) continue
    const column = Math.min(columns.length - 1, Math.floor(timeToX(frame.t, view, width)))
    if (column < 0) continue
    const range = columns[column]
    if (range) {
      range.min = Math.min(range.min, v)
      range.max = Math.max(range.max, v)
    } else {
      columns[column] = { min: v, max: v }
    }
  }
  return columns
}

export type SectionRun = { section: SongSection; startMs: number; endMs: number }

/** Each stretch of one section, from its first frame to the next run's first frame (the last to `endMs`). */
export const sectionRuns = (frames: readonly FrameReading[], endMs: number): SectionRun[] => {
  const runs: SectionRun[] = []
  frames.forEach(({ t, section }) => {
    const last = runs[runs.length - 1]
    if (last?.section === section) return
    if (last) last.endMs = t
    runs.push({ section, startMs: t, endMs })
  })
  return runs
}

export type BeatMark = { t: number; band: number | null }

export const beatMarks = (frames: readonly FrameReading[]): BeatMark[] =>
  frames.filter(({ beat }) => beat).map(({ t, beatBand }) => ({ t, band: beatBand }))

/** The largest value in each level band over the session, for scaling each band's lane to its own peak. */
export const levelPeaks = (frames: readonly FrameReading[], bands: number): number[] => {
  const peaks = new Array<number>(bands).fill(0)
  frames.forEach(({ levels }) => {
    for (let b = 0; b < bands; b++) peaks[b] = Math.max(peaks[b]!, levels[b] ?? 0)
  })
  return peaks
}

const TICK_STEPS_MS = [100, 250, 500, 1000, 2000, 5000, 10000, 15000, 30000, 60000, 120000, 300000, 600000]

/** Axis ticks for the window, round from `originMs` (the session's start): the smallest step that keeps them at least `minPx` apart. */
export const timeTicks = (view: View, width: number, originMs: number = 0, minPx: number = 90): number[] => {
  const span = view.endMs - view.startMs
  if (span <= 0 || width <= 0) return []
  const step = TICK_STEPS_MS.find((candidate) => (candidate / span) * width >= minPx) ?? TICK_STEPS_MS[TICK_STEPS_MS.length - 1]!
  const ticks: number[] = []
  for (let t = originMs + Math.ceil((view.startMs - originMs) / step) * step; t <= view.endMs; t += step) ticks.push(t)
  return ticks
}

/** A time (ms from the session's start) as m:ss.s, or m:ss.ss when `precise` (for placing a drum label). */
export const formatTime = (ms: number, precise: boolean = false): string => {
  const sign = ms < 0 ? '-' : ''
  const digits = precise ? 2 : 1
  // Rounded before the split, so 59.97 s reads 1:00.0, not 0:60.0.
  const unit = 1000 / 10 ** digits
  const abs = Math.round(Math.abs(ms) / unit) * unit
  const minutes = Math.floor(abs / 60000)
  const seconds = (abs - minutes * 60000) / 1000
  const text = seconds.toFixed(digits).padStart(digits + 3, '0')
  return `${sign}${minutes}:${text}`
}
