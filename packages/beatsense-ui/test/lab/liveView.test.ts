import { describe, expect, it } from 'vitest'

import type { Label, LabelKind } from '../../lab/recording/labels'
import { axisStepMs, between, drumLanes, formatSecondsAgo, liveView, riserSpans, tallySession } from '../../lab/recording/liveView'
import type { DrumDetection } from '../../lab/recording/sessionFile'

let nextId = 1
const label = (kind: LabelKind, t: number): Label => ({ id: nextId++, kind, t })

describe('live view', () => {
  it('ends the window at now', () => {
    expect(liveView(10000, 6000)).toEqual({ startMs: 4000, endMs: 10000 })
  })

  it('keeps the items inside a range', () => {
    expect(between([{ t: 1 }, { t: 5 }, { t: 9 }], 2, 9)).toEqual([{ t: 5 }, { t: 9 }])
  })

  it('splits labels and hits by drum and pairs them, a match window past each edge', () => {
    const labels = [label('kick', 3800), label('kick', 5200), label('snare', 6200), label('drop', 7000)]
    const hits: DrumDetection[] = [{ kind: 'kick', t: 3650 }, { kind: 'kick', t: 5000 }, { kind: 'hat', t: 5500 }, { kind: 'kick', t: 1000 }]
    const lanes = drumLanes(labels, hits, { startMs: 4000, endMs: 10000 })
    expect(lanes.map(({ kind }) => kind)).toEqual(['kick', 'snare', 'clap', 'hat'])
    const [kick, snare, , hat] = lanes
    // The kick at 3800 is just off the left edge but still pairs, with its hit further off; the hit at 1000 is far outside.
    expect(kick!.hitTimes).toEqual([3650, 5000])
    expect(kick!.comparison.matches.map(({ hitT }) => hitT)).toEqual([3650, 5000])
    expect(snare!.comparison.missedLabelIds).toHaveLength(1)
    expect(hat!.comparison.extraHitTimes).toEqual([5500])
  })

  it('tallies the session and the median label delay', () => {
    const labels = [label('kick', 1200), label('kick', 2250), label('snare', 3100), label('clap', 9000)]
    const hits: DrumDetection[] = [{ kind: 'kick', t: 1000 }, { kind: 'kick', t: 2000 }, { kind: 'snare', t: 3000 }, { kind: 'hat', t: 4000 }]
    const { drums, medianOffsetMs, pairs } = tallySession(labels, hits)
    expect(drums.kick).toEqual({ labels: 2, hits: 2, matched: 2 })
    expect(drums.clap).toEqual({ labels: 1, hits: 0, matched: 0 })
    expect(drums.hat).toEqual({ labels: 0, hits: 1, matched: 0 })
    expect(pairs).toBe(3)
    expect(medianOffsetMs).toBe(200)
    expect(tallySession([], []).medianOffsetMs).toBeNull()
  })

  it('pairs riser starts with the next end', () => {
    const labels = [label('riserEnd', 50), label('riserStart', 100), label('riserStart', 150), label('riserEnd', 400), label('riserEnd', 450), label('riserStart', 900)]
    expect(riserSpans(labels)).toEqual([{ startMs: 100, endMs: 400 }, { startMs: 900, endMs: null }])
  })
})

describe('the live axis', () => {
  it('steps with the Beat HUD\'s zoom', () => {
    expect(axisStepMs(2000)).toBe(250)
    expect(axisStepMs(6000)).toBe(1000)
    expect(axisStepMs(16000)).toBe(2000)
  })

  it('writes seconds before now', () => {
    expect(formatSecondsAgo(0)).toBe('now')
    expect(formatSecondsAgo(3000)).toBe('-3s')
    expect(formatSecondsAgo(1500)).toBe('-1.5s')
    expect(formatSecondsAgo(250)).toBe('-0.25s')
  })
})
