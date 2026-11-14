import { sortLabels, type Label } from './labels'

// The review page's edits, on immutable lists: each returns a new, time-sorted list and leaves the one given alone.

export type TimeBounds = { startMs: number; endMs: number }

const clamp = (t: number, { startMs, endMs }: TimeBounds): number => Math.min(endMs, Math.max(startMs, t))

/** The label `id` moved to `t`, kept inside the session. Unchanged if there is no such label. */
export const moveLabel = (labels: readonly Label[], id: number, t: number, bounds: TimeBounds): Label[] =>
  sortLabels(labels.map((label) => (label.id === id ? { ...label, t: clamp(t, bounds) } : label)))

/** The label `id` moved by `deltaMs` (the arrow keys' nudge). */
export const nudgeLabel = (labels: readonly Label[], id: number, deltaMs: number, bounds: TimeBounds): Label[] => {
  const label = labels.find((candidate) => candidate.id === id)
  return label ? moveLabel(labels, id, label.t + deltaMs, bounds) : sortLabels(labels)
}

export const deleteLabel = (labels: readonly Label[], id: number): Label[] => sortLabels(labels.filter((label) => label.id !== id))

/**
 * The label to pick up at `t`: the nearest within `toleranceMs`, or null. The tolerance is the caller's pixels in ms, so a click a few
 * pixels off still takes the label at any zoom.
 */
export const labelNear = (labels: readonly Label[], t: number, toleranceMs: number): Label | null => {
  let best: Label | null = null
  let bestDistance = toleranceMs
  labels.forEach((label) => {
    const distance = Math.abs(label.t - t)
    if (distance <= bestDistance) {
      best = label
      bestDistance = distance
    }
  })
  return best
}
