import type { SectionSlot, SongSection } from 'beatsense'
import { describe, expect, it } from 'vitest'

import { SLOT_MS, slotRuns } from '../src/sectionRuns'

const slot = (t: number, section: SongSection): SectionSlot => ({ t, section, total: 1, low: 1, mid: 1, high: 1, beats: 0 })

describe('slotRuns', () => {
  it('joins consecutive slots of one section into one run that ends where the next begins', () => {
    const slots = [slot(250, 'intro'), slot(500, 'intro'), slot(750, 'intro'), slot(1000, 'drop'), slot(1250, 'drop')]
    const runs = slotRuns(slots)
    expect(runs).toEqual([
      { section: 'intro', startMs: 0, endMs: 750 },
      { section: 'drop', startMs: 750, endMs: 1250 },
    ])
    // Touching, never overlapping: each run starts where the one before ends.
    expect(runs[1]!.startMs).toBe(runs[0]!.endMs)
  })

  it('leaves a gap where slots are missing', () => {
    const runs = slotRuns([slot(250, 'groove'), slot(500, 'groove'), slot(500 + SLOT_MS * 4, 'groove')])
    expect(runs).toEqual([
      { section: 'groove', startMs: 0, endMs: 500 },
      { section: 'groove', startMs: 1250, endMs: 1500 },
    ])
  })

  it('starts from the first slot shown', () => {
    expect(slotRuns([slot(250, 'intro'), slot(500, 'drop'), slot(750, 'drop')], 1)).toEqual([{ section: 'drop', startMs: 250, endMs: 750 }])
    expect(slotRuns([])).toEqual([])
  })
})
