import { describe, expect, it } from 'vitest'

import { AUTO_EVAL_MS, AUTO_GRACE_MS, AUTO_PROBE_WATCH_MS, AUTO_SLOW_FOR_MS } from '../config/quality.config'
import { QualityGovernor } from './quality-governor'

const FAST_MS = 16.7
const SLOW_MS = 40
const FRAMES_PER_WINDOW = 30

type Run = { governor: QualityGovernor; now: number; cost: number }

const start = (tier: 'saver' | 'balanced' | 'quality' = 'quality', cost = 2): Run => {
  const governor = new QualityGovernor(tier)
  // The first evaluation only records the scene's cost.
  governor.evaluate(0, cost, false)
  return { governor, now: 0, cost }
}

// Feeds `windows` evaluation windows of frames at `frameMs` and returns the tier after the last.
const run = (state: Run, frameMs: number, windows: number): string => {
  for (let i = 0; i < windows; i++) {
    for (let f = 0; f < FRAMES_PER_WINDOW; f++) state.governor.push(frameMs)
    state.now += AUTO_EVAL_MS
    state.governor.evaluate(state.now, state.cost, false)
  }
  return state.governor.getTier()
}

const windowsFor = (ms: number): number => Math.ceil(ms / AUTO_EVAL_MS)

describe('QualityGovernor', () => {
  it('stays put while frames are fast', () => {
    const state = start()
    expect(run(state, FAST_MS, 40)).toBe('quality')
  })

  it('steps down one tier after the frames stay slow for the slow stretch', () => {
    const state = start()
    expect(run(state, SLOW_MS, windowsFor(AUTO_SLOW_FOR_MS) - 1)).toBe('quality')
    expect(run(state, SLOW_MS, 1)).toBe('balanced')
  })

  it('restarts the slow stretch when a window is fast', () => {
    const state = start()
    run(state, SLOW_MS, 4)
    run(state, FAST_MS, 1)
    expect(run(state, SLOW_MS, 5)).toBe('quality')
  })

  it('judges a scene so heavy that only a couple of frames fit in a window', () => {
    const state = start()
    const slowWindows = windowsFor(AUTO_SLOW_FOR_MS)
    for (let w = 0; w < slowWindows; w++) {
      state.governor.push(250)
      state.governor.push(250)
      state.now += AUTO_EVAL_MS
      state.governor.evaluate(state.now, state.cost, false)
    }
    expect(state.governor.getTier()).toBe('balanced')
  })

  it('keeps stepping down while slow and stops at the lowest tier', () => {
    const state = start()
    expect(run(state, SLOW_MS, 100)).toBe('saver')
  })

  it('ignores frames for the grace window after the scene changes', () => {
    const state = start()
    state.cost = 4
    run(state, SLOW_MS, windowsFor(AUTO_GRACE_MS) - 1)
    expect(state.governor.getTier()).toBe('quality')
  })

  it('judges a 120Hz display by its own refresh rate', () => {
    const state = start()
    run(state, 8.3, 4)
    // 14ms is 70fps: fine on a 60Hz display, but a drop on one that ran at 120.
    expect(run(state, 20, windowsFor(AUTO_SLOW_FOR_MS))).toBe('balanced')
  })

  it('does not judge frames while the tier is capped', () => {
    const state = start('saver')
    for (let w = 0; w < 20; w++) {
      for (let f = 0; f < FRAMES_PER_WINDOW; f++) state.governor.push(SLOW_MS)
      state.now += AUTO_EVAL_MS
      expect(state.governor.evaluate(state.now, state.cost, true)).toBe('saver')
    }
  })

  describe('probing up', () => {
    const dropOnce = (): Run => {
      const state = start('quality', 3)
      run(state, SLOW_MS, windowsFor(AUTO_SLOW_FOR_MS))
      expect(state.governor.getTier()).toBe('balanced')
      return state
    }

    it('steps up once the scene gets clearly cheaper and the grace window has passed', () => {
      const state = dropOnce()
      state.cost = 1.5
      expect(run(state, FAST_MS, windowsFor(AUTO_GRACE_MS) + 1)).toBe('quality')
    })

    it('keeps climbing while probes hold and the scene stays cheap, and stops at the top', () => {
      const state = start('quality', 3)
      run(state, SLOW_MS, 40)
      expect(state.governor.getTier()).toBe('saver')
      state.cost = 1
      expect(run(state, FAST_MS, windowsFor(AUTO_GRACE_MS) + 1)).toBe('balanced')
      expect(run(state, FAST_MS, windowsFor(AUTO_PROBE_WATCH_MS) + 4)).toBe('quality')
      expect(run(state, FAST_MS, windowsFor(AUTO_PROBE_WATCH_MS) + 4)).toBe('quality')
    })

    it('does not step up for a change that is not cheaper than where it dropped', () => {
      const state = dropOnce()
      state.cost = 2.9
      expect(run(state, FAST_MS, windowsFor(AUTO_GRACE_MS) + 2)).toBe('balanced')
    })

    it('does not step up when the scene got heavier', () => {
      const state = dropOnce()
      state.cost = 5
      expect(run(state, FAST_MS, windowsFor(AUTO_GRACE_MS) + 2)).toBe('balanced')
    })

    it('steps back down when the probe is slow, and waits for a cheaper scene before trying again', () => {
      const state = dropOnce()
      state.cost = 2.5
      run(state, FAST_MS, windowsFor(AUTO_GRACE_MS) + 1)
      expect(state.governor.getTier()).toBe('quality')
      expect(run(state, SLOW_MS, windowsFor(AUTO_SLOW_FOR_MS) + 4)).toBe('balanced')
      expect(run(state, FAST_MS, 60)).toBe('balanced')
    })
  })
})
