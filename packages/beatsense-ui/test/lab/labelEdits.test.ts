import { describe, expect, it } from 'vitest'

import { deleteLabel, labelNear, moveLabel, nudgeLabel } from '../../lab/recording/labelEdits'
import type { Label } from '../../lab/recording/labels'

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
