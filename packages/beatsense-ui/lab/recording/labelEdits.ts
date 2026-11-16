import { riserPairs, sortLabels, type Label, type RiserPair } from './labels'

// The review page's edits, on immutable lists: each returns a new, time-sorted list and leaves the one given alone.

export type TimeBounds = { startMs: number; endMs: number }

const clamp = (t: number, { startMs, endMs }: TimeBounds): number => Math.min(endMs, Math.max(startMs, t))

const NO_LIMIT: TimeBounds = { startMs: -Infinity, endMs: Infinity }

/** The riser a label is the start or end of, with the risers either side of it; null for any other label. */
const riserOf = (labels: readonly Label[], id: number): { pair: RiserPair<Label>; previous?: RiserPair<Label>; next?: RiserPair<Label> } | null => {
  const pairs = riserPairs(sortLabels(labels))
  const at = pairs.findIndex(({ start, end }) => start.id === id || end?.id === id)
  if (at < 0) return null
  return { pair: pairs[at]!, previous: pairs[at - 1], next: pairs[at + 1] }
}

/**
 * Where a riser label may go: a start between the end of the riser before and its own end, an end between its own start and the start of
 * the riser after. So a move never turns a riser inside out or pairs it with another (an end before its start would leave the start open to
 * the session's end).
 */
const riserLimits = (labels: readonly Label[], id: number): TimeBounds => {
  const riser = riserOf(labels, id)
  if (!riser) return NO_LIMIT
  const { pair, previous, next } = riser
  if (pair.start.id === id) return { startMs: previous?.end?.t ?? -Infinity, endMs: pair.end?.t ?? Infinity }
  return { startMs: pair.start.t, endMs: next?.start.t ?? Infinity }
}

/**
 * The label `id` moved to `t`, kept inside `bounds` (the session, or the stretch of it the label is in) and, for a riser start or end, on
 * its own side of its partner. Unchanged if there is no such label, or nowhere it may go.
 */
export const moveLabel = (labels: readonly Label[], id: number, t: number, bounds: TimeBounds): Label[] => {
  const limits = riserLimits(labels, id)
  const allowed = { startMs: Math.max(bounds.startMs, limits.startMs), endMs: Math.min(bounds.endMs, limits.endMs) }
  if (allowed.startMs > allowed.endMs) return sortLabels(labels)
  return sortLabels(labels.map((label) => (label.id === id ? { ...label, t: clamp(t, allowed) } : label)))
}

/** The label `id` moved by `deltaMs` (the arrow keys' nudge). */
export const nudgeLabel = (labels: readonly Label[], id: number, deltaMs: number, bounds: TimeBounds): Label[] => {
  const label = labels.find((candidate) => candidate.id === id)
  return label ? moveLabel(labels, id, label.t + deltaMs, bounds) : sortLabels(labels)
}

/** The ids a delete of `id` removes: the label, and for a riser start or end its partner too, so no riser is left open or half there. */
const deletedIds = (labels: readonly Label[], id: number): Set<number> => {
  const riser = riserOf(labels, id)
  const ids = new Set([id])
  if (riser) {
    ids.add(riser.pair.start.id)
    if (riser.pair.end) ids.add(riser.pair.end.id)
  }
  return ids
}

/** The label `id` removed (with its partner, for a riser start or end). */
export const deleteLabel = (labels: readonly Label[], id: number): Label[] => {
  const ids = deletedIds(labels, id)
  return sortLabels(labels.filter((label) => !ids.has(label.id)))
}

/** The labels within `toleranceMs` of `t`, nearest first (ties by id, so labels on the same spot keep one order). */
export const labelsNear = <T extends Label>(labels: readonly T[], t: number, toleranceMs: number): T[] =>
  labels
    .filter((label) => Math.abs(label.t - t) <= toleranceMs)
    .sort((a, b) => Math.abs(a.t - t) - Math.abs(b.t - t) || a.id - b.id)

/**
 * The label to pick up at `t`: the nearest within `toleranceMs`, or null. The tolerance is the caller's pixels in ms, so a click a few
 * pixels off still takes the label at any zoom.
 */
export const labelNear = <T extends Label>(labels: readonly T[], t: number, toleranceMs: number): T | null => labelsNear(labels, t, toleranceMs)[0] ?? null

/**
 * The label a click at `t` selects next, given the one selected: with the selected one under the pointer, the next label on the same spot
 * (so repeated clicks cycle through labels that overlap, a kick and a clap on one hit), otherwise the nearest. Null with none in reach.
 */
export const nextLabelAt = <T extends Label>(labels: readonly T[], t: number, toleranceMs: number, selectedId: number | null): T | null => {
  const near = labelsNear(labels, t, toleranceMs)
  const at = near.findIndex(({ id }) => id === selectedId)
  return (at < 0 ? near[0] : near[(at + 1) % near.length]) ?? null
}

/**
 * The label before or after the selected one in time (`step` -1 or 1), for selecting by keyboard; with none selected, the first label at or
 * after `fromMs` going forward, or the last at or before it going back. Stays on the selected one at either end. `labels` is time-sorted.
 */
export const stepLabel = <T extends Label>(labels: readonly T[], selectedId: number | null, step: -1 | 1, fromMs: number): T | null => {
  const at = labels.findIndex(({ id }) => id === selectedId)
  if (at >= 0) return labels[Math.max(0, Math.min(labels.length - 1, at + step))] ?? null
  if (step > 0) return labels.find(({ t }) => t >= fromMs) ?? labels[labels.length - 1] ?? null
  return [...labels].reverse().find(({ t }) => t <= fromMs) ?? labels[0] ?? null
}
