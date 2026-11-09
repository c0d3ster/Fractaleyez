import { describe, expect, it } from 'vitest'
import type { SectionState } from '../audioanalysis/sections'
import { GhostStore } from '../utils/ghostStore'
import { AutoMode, isAutomatedEffectItem } from './auto-mode'
import { DEFAULT_TUNING, KaleidoscopeAuto, type KaleidoscopeTuning, wantedFold } from './kaleidoscope-target'

// The hold the first version used, kept under test so it can be switched back on (the default is no hold).
const WITH_HOLD: KaleidoscopeTuning = { ...DEFAULT_TUNING, wantMs: 1200 }

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

describe('wantedFold with a roll', () => {
  it('maps quarters and eighths to 4 and 6 mirrors, whatever the progress says', () => {
    const building = state({ section: 'buildup', buildupProgress: 0.9 })
    expect(wantedFold(building, 4).count).toBe(4)
    expect(wantedFold(building, 8).count).toBe(6)
  })

  it('ignores a roll outside a buildup', () => {
    expect(wantedFold(state({ section: 'groove' }), 8).on).toBe(false)
  })
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
    const auto = new KaleidoscopeAuto(WITH_HOLD)
    auto.step(state({}), 0, true)
    expect(auto.step(state({ section: 'buildup', buildupProgress: 0.5 }), 100, true).on).toBe(false)
    expect(auto.step(state({}), 600, true).on).toBe(false)
    expect(auto.step(state({}), 5000, true).on).toBe(false)
  })

  it('follows a buildup that lasts', () => {
    const auto = new KaleidoscopeAuto(WITH_HOLD)
    auto.step(state({}), 0, true)
    const building = state({ section: 'buildup', buildupProgress: 0.5 })
    auto.step(building, 100, true)
    expect(auto.step(building, 1500, true)).toEqual({ on: true, count: 6 })
  })

  it('goes straight to the big fold when a drop lands, then settles', () => {
    const auto = new KaleidoscopeAuto(WITH_HOLD)
    auto.step(state({}), 0, true)
    expect(auto.step(state({ section: 'drop', dropCount: 1, sinceDropMs: 0 }), 100, true)).toEqual({ on: true, count: 16 })
    expect(auto.step(state({ section: 'drop', dropCount: 1, sinceDropMs: 7000 }), 7100, true)).toEqual({ on: true, count: 16 })
    expect(auto.step(state({ section: 'drop', dropCount: 1, sinceDropMs: 7000 }), 8500, true)).toEqual({ on: true, count: 8 })
  })

  it('does not change twice inside the dwell time', () => {
    const auto = new KaleidoscopeAuto(WITH_HOLD)
    auto.step(state({}), 0, true)
    auto.step(state({ section: 'drop', dropCount: 1, sinceDropMs: 0 }), 100, true)
    const groove = state({ dropCount: 1 })
    auto.step(groove, 200, true)
    expect(auto.step(groove, 1600, true).on).toBe(true)
    expect(auto.step(groove, 3000, true).on).toBe(false)
  })

  it('with no hold (the default), follows a buildup as soon as there is a beat', () => {
    const auto = new KaleidoscopeAuto()
    auto.step(state({}), 0, false)
    const building = state({ section: 'buildup', buildupProgress: 0.1 })
    auto.step(building, 100, false)
    expect(auto.step(building, 200, true)).toEqual({ on: true, count: 2 })
  })

  it('shows a decided change on the next beat, not between beats', () => {
    const auto = new KaleidoscopeAuto(WITH_HOLD)
    auto.step(state({}), 0, false)
    const building = state({ section: 'buildup', buildupProgress: 0.5 })
    auto.step(building, 100, false)
    // Wanted long enough, but no beat yet: still showing the old fold.
    expect(auto.step(building, 1400, false).on).toBe(false)
    expect(auto.step(building, 1500, false).on).toBe(false)
    expect(auto.step(building, 1600, true)).toEqual({ on: true, count: 6 })
  })

  it('goes ahead without a beat after a short wait instead of hanging', () => {
    const auto = new KaleidoscopeAuto(WITH_HOLD)
    auto.step(state({}), 0, false)
    const building = state({ section: 'buildup', buildupProgress: 0.5 })
    auto.step(building, 100, false)
    expect(auto.step(building, 1400, false).on).toBe(false)
    expect(auto.step(building, 1900, false).on).toBe(false)
    expect(auto.step(building, 2100, false).on).toBe(true)
  })

  it('says a drop landed on the one step that brings in the big fold, and again on the next drop', () => {
    const auto = new KaleidoscopeAuto(WITH_HOLD)
    auto.step(state({}), 0, true)
    expect(auto.landedDrop()).toBe(false)
    auto.step(state({ section: 'drop', dropCount: 1, sinceDropMs: 0 }), 100, true)
    expect(auto.landedDrop()).toBe(true)
    auto.step(state({ section: 'drop', dropCount: 1, sinceDropMs: 500 }), 600, true)
    expect(auto.landedDrop()).toBe(false)
    // Settled to 8 (wanted from 7100, shown once the hold is over), then a second drop brings 16 back.
    auto.step(state({ section: 'drop', dropCount: 1, sinceDropMs: 7000 }), 7100, true)
    expect(auto.step(state({ section: 'drop', dropCount: 1, sinceDropMs: 7000 }), 8500, true)).toEqual({ on: true, count: 8 })
    expect(auto.landedDrop()).toBe(false)
    auto.step(state({ section: 'drop', dropCount: 2, sinceDropMs: 0 }), 9000, true)
    expect(auto.landedDrop()).toBe(true)
  })

  it('lands a drop on the first beat after it, without the usual wait', () => {
    const auto = new KaleidoscopeAuto(WITH_HOLD)
    auto.step(state({}), 0, false)
    const drop = state({ section: 'drop', dropCount: 1, sinceDropMs: 0 })
    expect(auto.step(drop, 100, false).on).toBe(false)
    expect(auto.step(drop, 250, true)).toEqual({ on: true, count: 16 })
  })

  it('drops a decided change if the wish goes back to what is showing before the beat', () => {
    const auto = new KaleidoscopeAuto(WITH_HOLD)
    auto.step(state({}), 0, false)
    const building = state({ section: 'buildup', buildupProgress: 0.5 })
    auto.step(building, 100, false)
    auto.step(building, 1400, false)
    expect(auto.step(state({}), 1500, false).on).toBe(false)
    expect(auto.step(state({}), 1600, true).on).toBe(false)
  })

  it('steps 2, 4, 6 as the roll goes quarters, then eighths, each on a beat', () => {
    const auto = new KaleidoscopeAuto()
    auto.step(state({}), 0, false)
    const building = state({ section: 'buildup', buildupProgress: 0.1 })
    // The start of the buildup, no roll yet: progress says 2.
    auto.step(building, 100, false, null)
    expect(auto.step(building, 200, true, null)).toEqual({ on: true, count: 2 })
    // Each step goes out on the next beat without waiting out the dwell.
    expect(auto.step(building, 700, false, 4).count).toBe(2)
    expect(auto.step(building, 800, true, 4).count).toBe(4)
    auto.step(building, 1000, false, 8)
    expect(auto.step(building, 1200, true, 8).count).toBe(6)
  })

  it('never takes mirrors away within a buildup when the roll thins out', () => {
    const auto = new KaleidoscopeAuto()
    auto.step(state({}), 0, false)
    const building = state({ section: 'buildup', buildupProgress: 0.1 })
    auto.step(building, 100, false, 8)
    expect(auto.step(building, 200, true, 8).count).toBe(6)
    expect(auto.step(building, 3000, true, 4).count).toBe(6)
    expect(auto.step(building, 3500, true, null).count).toBe(6)
  })

  it('falls back to the buildup progress when there is no roll', () => {
    const auto = new KaleidoscopeAuto()
    auto.step(state({}), 0, false)
    const late = state({ section: 'buildup', buildupProgress: 0.7 })
    auto.step(late, 100, false, null)
    expect(auto.step(late, 200, true, null)).toEqual({ on: true, count: 6 })
  })

  it('starts the next buildup from the bottom', () => {
    const auto = new KaleidoscopeAuto()
    auto.step(state({}), 0, false)
    const building = state({ section: 'buildup', buildupProgress: 0.1 })
    auto.step(building, 100, false, 8)
    auto.step(building, 200, true, 8)
    auto.step(state({ section: 'break' }), 5000, true, null)
    auto.step(state({ section: 'break' }), 5100, true, null)
    auto.step(building, 9000, false, null)
    expect(auto.step(building, 9100, true, null).count).toBe(2)
  })

  it('starts clean on a new song', () => {
    const auto = new KaleidoscopeAuto(WITH_HOLD)
    auto.step(state({}), 0, true)
    auto.step(state({ section: 'drop', dropCount: 1, sinceDropMs: 0 }), 100, true)
    expect(auto.step(state({ section: 'drop', dropCount: 1, songIndex: 2 }), 200, true).on).toBe(false)
  })
})

describe('AutoMode', () => {
  it('asks for one shockwave on the frame a drop lands, and none while off', () => {
    const mode = new AutoMode(new GhostStore())
    const drop = state({ section: 'drop', dropCount: 1, sinceDropMs: 0 })
    mode.kaleidoscope(state({}), 0, true)
    expect(mode.dropShockwave()).toBe(false)
    mode.kaleidoscope(drop, 100, true)
    expect(mode.dropShockwave()).toBe(true)
    mode.kaleidoscope(drop, 120, true)
    expect(mode.dropShockwave()).toBe(false)

    const off = new AutoMode(new GhostStore())
    off.kaleidoscope(state({}), 0, true)
    off.kaleidoscope(drop, 100, true)
    off.takeOver()
    expect(off.dropShockwave()).toBe(false)
  })

  it('is on by default and gives a fold only while on', () => {
    const mode = new AutoMode()
    const drop = state({ section: 'drop', dropCount: 1, sinceDropMs: 0 })
    mode.kaleidoscope(state({}), 0, true)
    expect(mode.kaleidoscope(drop, 100, true)?.on).toBe(true)
    mode.takeOver()
    expect(mode.isEnabled()).toBe(false)
    expect(mode.kaleidoscope(drop, 200, true)).toBeNull()
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

  it('shows what it is doing as ghosts, and takes them away when it steps back', () => {
    const ghosts = new GhostStore()
    const mode = new AutoMode(ghosts)
    mode.kaleidoscope(state({}), 0, true)
    expect(ghosts.get('effects.kaleidoscope')).toBe(false)
    expect(ghosts.get('effects.kaleidoscopeCount')).toBeNull()
    mode.kaleidoscope(state({ section: 'drop', dropCount: 1, sinceDropMs: 0 }), 100, true)
    expect(ghosts.get('effects.kaleidoscope')).toBe(true)
    expect(ghosts.get('effects.kaleidoscopeCount')).toBe(16)
    mode.takeOver()
    expect(ghosts.get('effects.kaleidoscope')).toBeNull()
    expect(ghosts.get('effects.kaleidoscopeCount')).toBeNull()
  })

  it('treats only the kaleidoscope items as automated for now', () => {
    expect(isAutomatedEffectItem('effects', 'kaleidoscope')).toBe(true)
    expect(isAutomatedEffectItem('effects', 'kaleidoscopeCount')).toBe(true)
    expect(isAutomatedEffectItem('effects', 'glow')).toBe(false)
    expect(isAutomatedEffectItem('user', 'kaleidoscope')).toBe(false)
  })
})
