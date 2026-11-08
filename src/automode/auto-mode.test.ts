import { describe, expect, it } from 'vitest'
import type { SectionState } from '../audioanalysis/sections'
import { AutoMode, isAutomatedEffectItem } from './auto-mode'
import { KaleidoscopeAuto, wantedFold } from './kaleidoscope-target'

const state = (patch: Partial<SectionState>): SectionState => ({
  section: 'groove',
  intensity: 0.8,
  buildupProgress: 0,
  sinceMs: 0,
  songIndex: 1,
  songMs: 60000,
  dropCount: 0,
  sinceDropMs: null,
  confidence: 1,
  ...patch,
})

describe('wantedFold', () => {
  it('is off in groove, quiet, intro, break and outro, and before a song is playing', () => {
    for (const section of ['groove', 'quiet', 'intro', 'break', 'outro'] as const) {
      expect(wantedFold(state({ section })).on).toBe(false)
    }
    expect(wantedFold(state({ section: 'drop', songMs: null })).on).toBe(false)
  })

  it('adds mirrors as a buildup climbs, always an even count', () => {
    const counts = [0, 0.3, 0.6, 0.99].map((buildupProgress) => wantedFold(state({ section: 'buildup', buildupProgress })).count)
    expect(counts).toEqual([2, 4, 6, 8])
    counts.forEach((count) => expect(count % 2).toBe(0))
  })

  it('lands big on a drop and settles', () => {
    expect(wantedFold(state({ section: 'drop', sinceDropMs: 1000 }))).toEqual({ on: true, count: 16 })
    expect(wantedFold(state({ section: 'drop', sinceDropMs: 9000 }))).toEqual({ on: true, count: 8 })
  })
})

describe('KaleidoscopeAuto', () => {
  it('ignores a label that flickers for under a second', () => {
    const auto = new KaleidoscopeAuto()
    auto.step(state({}), 0)
    expect(auto.step(state({ section: 'buildup', buildupProgress: 0.5 }), 100).on).toBe(false)
    expect(auto.step(state({}), 600).on).toBe(false)
    expect(auto.step(state({}), 5000).on).toBe(false)
  })

  it('follows a buildup that lasts', () => {
    const auto = new KaleidoscopeAuto()
    auto.step(state({}), 0)
    const building = state({ section: 'buildup', buildupProgress: 0.5 })
    auto.step(building, 100)
    expect(auto.step(building, 1500)).toEqual({ on: true, count: 6 })
  })

  it('goes straight to the big fold when a drop lands, then settles', () => {
    const auto = new KaleidoscopeAuto()
    auto.step(state({}), 0)
    expect(auto.step(state({ section: 'drop', dropCount: 1, sinceDropMs: 0 }), 100)).toEqual({ on: true, count: 16 })
    expect(auto.step(state({ section: 'drop', dropCount: 1, sinceDropMs: 7000 }), 7100)).toEqual({ on: true, count: 16 })
    expect(auto.step(state({ section: 'drop', dropCount: 1, sinceDropMs: 7000 }), 8500)).toEqual({ on: true, count: 8 })
  })

  it('does not change twice inside the dwell time', () => {
    const auto = new KaleidoscopeAuto()
    auto.step(state({}), 0)
    auto.step(state({ section: 'drop', dropCount: 1, sinceDropMs: 0 }), 100)
    const groove = state({ dropCount: 1 })
    auto.step(groove, 200)
    expect(auto.step(groove, 1600).on).toBe(true)
    expect(auto.step(groove, 3000).on).toBe(false)
  })

  it('starts clean on a new song', () => {
    const auto = new KaleidoscopeAuto()
    auto.step(state({}), 0)
    auto.step(state({ section: 'drop', dropCount: 1, sinceDropMs: 0 }), 100)
    expect(auto.step(state({ section: 'drop', dropCount: 1, songIndex: 2 }), 200).on).toBe(false)
  })
})

describe('AutoMode', () => {
  it('is on by default and gives a fold only while on', () => {
    const mode = new AutoMode()
    const drop = state({ section: 'drop', dropCount: 1, sinceDropMs: 0 })
    mode.kaleidoscope(state({}), 0)
    expect(mode.kaleidoscope(drop, 100)?.on).toBe(true)
    mode.takeOver()
    expect(mode.isEnabled()).toBe(false)
    expect(mode.kaleidoscope(drop, 200)).toBeNull()
  })

  it('tells listeners when it switches, and only then', () => {
    const mode = new AutoMode()
    let calls = 0
    const stop = mode.subscribe(() => { calls++ })
    mode.setEnabled(true)
    mode.takeOver()
    mode.takeOver()
    mode.setEnabled(true)
    expect(calls).toBe(2)
    stop()
    mode.takeOver()
    expect(calls).toBe(2)
  })

  it('treats only the kaleidoscope items as automated for now', () => {
    expect(isAutomatedEffectItem('effects', 'kaleidoscope')).toBe(true)
    expect(isAutomatedEffectItem('effects', 'kaleidoscopeCount')).toBe(true)
    expect(isAutomatedEffectItem('effects', 'glow')).toBe(false)
    expect(isAutomatedEffectItem('user', 'kaleidoscope')).toBe(false)
  })
})
