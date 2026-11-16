import { describe, expect, it } from 'vitest'

import { deleteLabel, labelNear, labelsNear, moveLabel, nextLabelAt, nudgeLabel, stepLabel } from '../../lab/recording/labelEdits'
import type { Label } from '../../lab/recording/labels'
import { riserSpans } from '../../lab/recording/liveView'

const BOUNDS = { startMs: 1000, endMs: 9000 }
const LABELS: Label[] = [
  { id: 1, kind: 'kick', t: 2000 },
  { id: 2, kind: 'snare', t: 3000 },
  { id: 3, kind: 'drop', t: 5000 },
]

describe('label edits', () => {
  it('moves a label and keeps the list sorted, leaving the original alone', () => {
    const moved = moveLabel(LABELS, 1, 4000, BOUNDS)
    expect(moved.map(({ id }) => id)).toEqual([2, 1, 3])
    expect(moved[1]).toEqual({ id: 1, kind: 'kick', t: 4000 })
    expect(LABELS[0]!.t).toBe(2000)
  })

  it('keeps a moved label inside the session', () => {
    expect(moveLabel(LABELS, 3, 20000, BOUNDS).find(({ id }) => id === 3)!.t).toBe(9000)
    expect(moveLabel(LABELS, 3, -5, BOUNDS).find(({ id }) => id === 3)!.t).toBe(1000)
  })

  it('nudges by a delta', () => {
    expect(nudgeLabel(LABELS, 2, -10, BOUNDS).find(({ id }) => id === 2)!.t).toBe(2990)
  })

  it('leaves the list unchanged for an unknown id', () => {
    expect(moveLabel(LABELS, 99, 4000, BOUNDS)).toEqual(LABELS)
    expect(nudgeLabel(LABELS, 99, 10, BOUNDS)).toEqual(LABELS)
    expect(deleteLabel(LABELS, 99)).toEqual(LABELS)
  })

  it('deletes by id', () => {
    expect(deleteLabel(LABELS, 2).map(({ id }) => id)).toEqual([1, 3])
  })

  it('picks the nearest label within the tolerance', () => {
    expect(labelNear(LABELS, 2040, 50)?.id).toBe(1)
    expect(labelNear(LABELS, 2600, 50)).toBeNull()
    expect(labelNear(LABELS, 2510, 600)?.id).toBe(2)
  })
})

// A kick and a clap on one hit, a hat a little after.
const STACKED: Label[] = [
  { id: 1, kind: 'kick', t: 2000 },
  { id: 2, kind: 'clap', t: 2000 },
  { id: 3, kind: 'hat', t: 2010 },
  { id: 4, kind: 'snare', t: 5000 },
]

describe('picking labels on the same spot', () => {
  it('lists every label in reach, nearest first and ties in id order', () => {
    expect(labelsNear(STACKED, 2002, 20).map(({ id }) => id)).toEqual([1, 2, 3])
    expect(labelsNear(STACKED, 2009, 20).map(({ id }) => id)).toEqual([3, 1, 2])
  })

  it('cycles through them on repeated clicks, starting from the nearest', () => {
    expect(nextLabelAt(STACKED, 2000, 20, null)?.id).toBe(1)
    expect(nextLabelAt(STACKED, 2000, 20, 1)?.id).toBe(2)
    expect(nextLabelAt(STACKED, 2000, 20, 2)?.id).toBe(3)
    expect(nextLabelAt(STACKED, 2000, 20, 3)?.id).toBe(1)
    // With the selected one elsewhere, the nearest.
    expect(nextLabelAt(STACKED, 2000, 20, 4)?.id).toBe(1)
    expect(nextLabelAt(STACKED, 3000, 20, 1)).toBeNull()
  })

  it('steps to the label before or after the selected one, or in from the view\'s edge with none selected', () => {
    expect(stepLabel(STACKED, 1, 1, 0)?.id).toBe(2)
    expect(stepLabel(STACKED, 2, -1, 0)?.id).toBe(1)
    expect(stepLabel(STACKED, 4, 1, 0)?.id).toBe(4)
    expect(stepLabel(STACKED, 1, -1, 0)?.id).toBe(1)
    expect(stepLabel(STACKED, null, 1, 2005)?.id).toBe(3)
    expect(stepLabel(STACKED, null, -1, 4000)?.id).toBe(3)
    expect(stepLabel(STACKED, null, 1, 9000)?.id).toBe(4)
    expect(stepLabel([], null, 1, 0)).toBeNull()
  })
})

// Two risers: 2 s to 4 s and 6 s to 7 s, with a kick in between.
const RISERS: Label[] = [
  { id: 1, kind: 'riserStart', t: 2000 },
  { id: 2, kind: 'riserEnd', t: 4000 },
  { id: 3, kind: 'kick', t: 5000 },
  { id: 4, kind: 'riserStart', t: 6000 },
  { id: 5, kind: 'riserEnd', t: 7000 },
]

const timeOf = (labels: readonly Label[], id: number): number | undefined => labels.find((label) => label.id === id)?.t

describe('editing risers', () => {
  it('keeps a riser\'s end after its start and before the next riser', () => {
    expect(timeOf(moveLabel(RISERS, 2, 1000, BOUNDS), 2)).toBe(2000)
    expect(timeOf(moveLabel(RISERS, 2, 6500, BOUNDS), 2)).toBe(6000)
    expect(timeOf(moveLabel(RISERS, 2, 4500, BOUNDS), 2)).toBe(4500)
    expect(timeOf(nudgeLabel(RISERS, 5, -5000, BOUNDS), 5)).toBe(6000)
  })

  it('keeps a riser\'s start before its end and after the riser before', () => {
    expect(timeOf(moveLabel(RISERS, 1, 4500, BOUNDS), 1)).toBe(4000)
    expect(timeOf(moveLabel(RISERS, 4, 3000, BOUNDS), 4)).toBe(4000)
    expect(timeOf(moveLabel(RISERS, 4, 6800, BOUNDS), 4)).toBe(6800)
    // A move never changes which start pairs with which end.
    expect(riserSpans(moveLabel(RISERS, 4, 3000, BOUNDS))).toEqual([{ startMs: 2000, endMs: 4000 }, { startMs: 4000, endMs: 7000 }])
    expect(riserSpans(moveLabel(RISERS, 2, 1000, BOUNDS))).toEqual([{ startMs: 2000, endMs: 2000 }, { startMs: 6000, endMs: 7000 }])
  })

  it('moves an open riser\'s start anywhere after the riser before, and other labels freely', () => {
    const open = RISERS.slice(0, 4)
    expect(timeOf(moveLabel(open, 4, 8500, BOUNDS), 4)).toBe(8500)
    expect(timeOf(moveLabel(RISERS, 3, 6500, BOUNDS), 3)).toBe(6500)
  })

  it('deletes a riser\'s start and end together, so none is left open or pairs with another', () => {
    expect(deleteLabel(RISERS, 2).map(({ id }) => id)).toEqual([3, 4, 5])
    expect(deleteLabel(RISERS, 4).map(({ id }) => id)).toEqual([1, 2, 3])
    expect(riserSpans(deleteLabel(RISERS, 2))).toEqual([{ startMs: 6000, endMs: 7000 }])
    // An open riser's start, and an end with no start (from a file edited by hand), go alone.
    expect(deleteLabel(RISERS.slice(0, 4), 4).map(({ id }) => id)).toEqual([1, 2, 3])
    const orphan: Label[] = [{ id: 9, kind: 'riserEnd', t: 1500 }, ...RISERS]
    expect(deleteLabel(orphan, 9)).toEqual(RISERS)
  })
})
