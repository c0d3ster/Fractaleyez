import { describe, expect, it } from 'vitest'

import { AUTO_BUSY_MAX_MS, AUTO_CLIMB_AFTER_MS, AUTO_DISTURB_MS, AUTO_EVAL_MS, AUTO_PROBE_WATCH_MS, AUTO_RETRY_BASE_MS, AUTO_RETRY_MAX_MS, AUTO_SEVERE_WEIGHT, AUTO_SLOW_FOR_MS } from '../config/quality.config'
import { GovernorOptions, QualityGovernor } from './quality-governor'

const FAST_MS = 16.7
const SLOW_MS = 40
const FRAMES_PER_WINDOW = 30

type Run = { governor: QualityGovernor; now: number; cost: number }

type Tier = 'saver' | 'balanced' | 'quality' | 'ultra'

// Climbing on clean frames is off unless a test asks for it, so the step-down tests below stay about stepping down.
const start = (tier: Tier = 'quality', cost = 2, options: GovernorOptions = { climbAfterMs: null }): Run => {
  const governor = new QualityGovernor(tier, options)
  // The first evaluation only records the scene's cost.
  governor.evaluate(0, cost, false)
  return { governor, now: 0, cost }
}

// Feeds `windows` evaluation windows of frames at `frameMs` and returns the tier after the last.
const run = (state: Run, frameMs: number, windows: number, videoDropRate = 0, capped = false): string => {
  for (let i = 0; i < windows; i++) {
    for (let f = 0; f < FRAMES_PER_WINDOW; f++) state.governor.push(frameMs)
    state.now += AUTO_EVAL_MS
    state.governor.evaluate(state.now, state.cost, false || capped, videoDropRate)
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

  it('ignores frames for the disturb window after the scene changes, then judges them', () => {
    const state = start()
    state.cost = 4
    const ignored = windowsFor(AUTO_DISTURB_MS)
    const toStepDown = windowsFor(AUTO_SLOW_FOR_MS)
    expect(run(state, SLOW_MS, ignored + toStepDown - 1)).toBe('quality')
    expect(run(state, SLOW_MS, 1)).toBe('balanced')
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

  describe('climbing on clean frames', () => {
    const climbing = (tier: Tier, cost = 2, options: GovernorOptions = {}): Run => start(tier, cost, options)
    const cleanWindows = windowsFor(AUTO_CLIMB_AFTER_MS)
    const watchWindows = windowsFor(AUTO_PROBE_WATCH_MS) + 2

    it('tries the next tier after the clean stretch, not before', () => {
      const state = climbing('balanced')
      expect(run(state, FAST_MS, cleanWindows - 1)).toBe('balanced')
      expect(run(state, FAST_MS, 1)).toBe('quality')
    })

    it('keeps climbing one tier per clean stretch and stops at the top', () => {
      const state = climbing('balanced')
      expect(run(state, FAST_MS, cleanWindows)).toBe('quality')
      expect(run(state, FAST_MS, watchWindows + cleanWindows)).toBe('ultra')
      expect(run(state, FAST_MS, 100)).toBe('ultra')
    })

    it('lets a capped tier climb, since its frame times only show the cap', () => {
      const state = climbing('saver')
      expect(run(state, FAST_MS, cleanWindows, 0, true)).toBe('balanced')
    })

    it('restarts the clean stretch when a window is slow', () => {
      const state = climbing('balanced')
      run(state, FAST_MS, cleanWindows - 2)
      run(state, SLOW_MS, 1)
      expect(run(state, FAST_MS, cleanWindows - 2)).toBe('balanced')
      expect(run(state, FAST_MS, 3)).toBe('quality')
    })

    it('does not climb while video frames are being dropped, even with fast frames', () => {
      const state = climbing('balanced')
      expect(run(state, FAST_MS, cleanWindows * 3, 0.1)).toBe('balanced')
    })

    it('does not count one bad window of dropped video frames as trouble', () => {
      const state = climbing('balanced')
      run(state, FAST_MS, cleanWindows - 4)
      run(state, FAST_MS, 1, 0.08)
      expect(run(state, FAST_MS, 6)).toBe('quality')
    })

    it('steps back down when the climb turns slow', () => {
      const state = climbing('balanced')
      run(state, FAST_MS, cleanWindows)
      expect(state.governor.getTier()).toBe('quality')
      expect(run(state, SLOW_MS, windowsFor(AUTO_SLOW_FOR_MS) + 4)).toBe('balanced')
    })

    it('never climbs when climbing is off', () => {
      const state = climbing('balanced', 2, { climbAfterMs: null })
      expect(run(state, FAST_MS, cleanWindows * 4)).toBe('balanced')
    })
  })

  describe('waiting before stepping up again', () => {
    const climbing = (tier: Tier): Run => start(tier, 2, {})
    const cleanWindows = windowsFor(AUTO_CLIMB_AFTER_MS)

    // Runs clean windows until the tier goes up, and returns how long that took.
    const msUntilClimb = (state: Run, from: string): number => {
      const began = state.now
      for (let w = 0; w < windowsFor(AUTO_RETRY_MAX_MS * 2); w++) {
        if (run(state, FAST_MS, 1) !== from) return state.now - began
      }
      return Number.POSITIVE_INFINITY
    }
    // A step up that turns slow within its trial and has to be undone.
    const failClimb = (state: Run): void => {
      run(state, SLOW_MS, windowsFor(AUTO_SLOW_FOR_MS) + 4)
    }

    it('does not step up before the wait is over, even with clean frames', () => {
      const state = climbing('quality')
      run(state, SLOW_MS, windowsFor(AUTO_SLOW_FOR_MS))
      expect(state.governor.getTier()).toBe('balanced')
      expect(run(state, FAST_MS, windowsFor(AUTO_RETRY_BASE_MS) - 6)).toBe('balanced')
    })

    it('steps up once the base wait and the clean stretch are over', () => {
      const state = climbing('quality')
      run(state, SLOW_MS, windowsFor(AUTO_SLOW_FOR_MS))
      const waited = msUntilClimb(state, 'balanced')
      expect(waited).toBeGreaterThanOrEqual(AUTO_RETRY_BASE_MS - AUTO_SLOW_FOR_MS)
      expect(waited).toBeLessThanOrEqual(AUTO_RETRY_BASE_MS + AUTO_CLIMB_AFTER_MS)
    })

    it('doubles the wait each time a step up has to be undone, up to the maximum', () => {
      const state = climbing('quality')
      run(state, SLOW_MS, windowsFor(AUTO_SLOW_FOR_MS))
      const waits: number[] = []
      for (let attempt = 0; attempt < 6; attempt++) {
        waits.push(msUntilClimb(state, 'balanced'))
        failClimb(state)
        expect(state.governor.getTier()).toBe('balanced')
      }
      // The first wait is the base; each failure doubles the next, and none passes the maximum plus the clean stretch.
      expect(waits[0]).toBeLessThanOrEqual(AUTO_RETRY_BASE_MS + AUTO_CLIMB_AFTER_MS)
      expect(waits[1]).toBeGreaterThan(AUTO_RETRY_BASE_MS * 1.5)
      expect(waits[2]).toBeGreaterThan(AUTO_RETRY_BASE_MS * 3)
      waits.forEach((wait) => expect(wait).toBeLessThanOrEqual(AUTO_RETRY_MAX_MS + AUTO_CLIMB_AFTER_MS))
      expect(waits[5]).toBeGreaterThan(AUTO_RETRY_MAX_MS - AUTO_SLOW_FOR_MS)
    })

    it('goes back to the base wait once a step up holds', () => {
      const state = climbing('quality')
      run(state, SLOW_MS, windowsFor(AUTO_SLOW_FOR_MS))
      msUntilClimb(state, 'balanced')
      failClimb(state)
      expect(msUntilClimb(state, 'balanced')).toBeGreaterThan(AUTO_RETRY_BASE_MS * 1.5)
      // This one holds past its trial.
      run(state, FAST_MS, windowsFor(AUTO_PROBE_WATCH_MS) + 4)
      expect(state.governor.getTier()).toBe('quality')
      run(state, SLOW_MS, windowsFor(AUTO_SLOW_FOR_MS) + 4)
      expect(msUntilClimb(state, 'balanced')).toBeLessThanOrEqual(AUTO_RETRY_BASE_MS + AUTO_CLIMB_AFTER_MS)
    })

    it('reports how long is left of the wait', () => {
      const state = climbing('quality')
      expect(state.governor.getDiagnostics(state.now).retryInMs).toBe(0)
      run(state, SLOW_MS, windowsFor(AUTO_SLOW_FOR_MS))
      const left = state.governor.getDiagnostics(state.now).retryInMs
      expect(left).toBeGreaterThan(AUTO_RETRY_BASE_MS - 2000)
      expect(left).toBeLessThanOrEqual(AUTO_RETRY_BASE_MS)
    })

    it('explains the last move', () => {
      const state = climbing('quality')
      expect(state.governor.getDiagnostics(state.now).lastChange).toBeNull()
      run(state, SLOW_MS, windowsFor(AUTO_SLOW_FOR_MS))
      const change = state.governor.getDiagnostics(state.now).lastChange
      expect(change).toMatchObject({ from: 'quality', to: 'balanced' })
      expect(change?.reason).toMatch(/^slow /)
      msUntilClimb(state, 'balanced')
      expect(state.governor.getDiagnostics(state.now).lastChange?.reason).toMatch(/ s clean$/)
    })

    it('has a clean stretch of its own before the first step up from the start', () => {
      const state = climbing('balanced')
      expect(run(state, FAST_MS, cleanWindows - 1)).toBe('balanced')
      expect(run(state, FAST_MS, 1)).toBe('quality')
    })
  })

  describe('rough frames', () => {
    // A window of `FRAMES_PER_WINDOW` fast frames of which `rough` are long hitches.
    const roughWindows = (state: Run, rough: number, hitchMs: number, windows: number): string => {
      for (let w = 0; w < windows; w++) {
        for (let f = 0; f < FRAMES_PER_WINDOW; f++) state.governor.push(f < rough ? hitchMs : 4.2)
        state.now += AUTO_EVAL_MS
        state.governor.evaluate(state.now, state.cost, false)
      }
      return state.governor.getTier()
    }

    it('steps down when a tenth of the frames are long hitches, though the median is fast', () => {
      const state = start('ultra')
      run(state, 4.2, 40)
      expect(roughWindows(state, 4, 13, windowsFor(AUTO_SLOW_FOR_MS) + 2)).toBe('quality')
    })

    it('ignores the odd hitch', () => {
      const state = start('ultra')
      run(state, 4.2, 40)
      expect(roughWindows(state, 1, 40, 40)).toBe('ultra')
    })
  })
})

// Like `run`, with something loading (or not) throughout.
const runLoading = (state: Run, frameMs: number, windows: number, busy: boolean): string => {
  for (let i = 0; i < windows; i++) {
    for (let f = 0; f < FRAMES_PER_WINDOW; f++) state.governor.push(frameMs)
    state.now += AUTO_EVAL_MS
    state.governor.evaluate(state.now, state.cost, false, 0, busy)
  }
  return state.governor.getTier()
}

describe('QualityGovernor while something loads', () => {
  it('ignores slow frames for as long as the load lasts', () => {
    const state = start()
    expect(runLoading(state, SLOW_MS, windowsFor(AUTO_BUSY_MAX_MS) - 2, true)).toBe('quality')
  })

  it('judges again as soon as the load is done and the settle has passed', () => {
    const state = start()
    runLoading(state, SLOW_MS, 14, true)
    expect(runLoading(state, SLOW_MS, windowsFor(AUTO_SLOW_FOR_MS) - 1, false)).toBe('quality')
    expect(runLoading(state, SLOW_MS, 1, false)).toBe('balanced')
  })

  it('stops waiting for a load that never ends, so it cannot turn Auto off for good', () => {
    const state = start()
    expect(runLoading(state, SLOW_MS, windowsFor(AUTO_BUSY_MAX_MS + AUTO_SLOW_FOR_MS) + 3, true)).toBe('balanced')
  })

  it('does not count the frames of a load toward a climb either', () => {
    const state = start('balanced', 2, {})
    runLoading(state, FAST_MS, windowsFor(AUTO_CLIMB_AFTER_MS) + 2, true)
    expect(state.governor.getTier()).toBe('balanced')
  })
})

describe('QualityGovernor with a stall', () => {
  // A median frame several times the slow limit: the machine is really struggling, not just a heavy scene.
  const STALL_MS = 100

  it('steps down sooner than for ordinary slow frames', () => {
    const state = start()
    const windows = windowsFor(AUTO_SLOW_FOR_MS / AUTO_SEVERE_WEIGHT)
    expect(run(state, STALL_MS, windows - 1)).toBe('quality')
    expect(run(state, STALL_MS, 1)).toBe('balanced')
  })

  it('still needs the full stretch for frames that are only slow', () => {
    const state = start()
    expect(run(state, SLOW_MS, windowsFor(AUTO_SLOW_FOR_MS / AUTO_SEVERE_WEIGHT))).toBe('quality')
  })
})

describe('QualityGovernor smoothness', () => {
  it('counts up the time since the last trouble', () => {
    const state = start()
    run(state, FAST_MS, 4)
    expect(state.governor.getSmoothness()).toEqual({ loading: false, ms: 4 * AUTO_EVAL_MS })
  })

  it('goes negative for as long as frames are slow, and back to counting up after', () => {
    const state = start()
    run(state, SLOW_MS, 3)
    expect(state.governor.getSmoothness().ms).toBe(-3 * AUTO_EVAL_MS)
    run(state, FAST_MS, 2)
    expect(state.governor.getSmoothness().ms).toBe(2 * AUTO_EVAL_MS)
  })

  it('says loading while something loads, and after the settle it counts from zero', () => {
    const state = start()
    run(state, FAST_MS, 6)
    runLoading(state, FAST_MS, 2, true)
    expect(state.governor.getSmoothness().loading).toBe(true)
    runLoading(state, FAST_MS, 3, false)
    const { loading, ms } = state.governor.getSmoothness()
    expect(loading).toBe(false)
    expect(ms).toBeLessThanOrEqual(3 * AUTO_EVAL_MS)
  })

  it('measures but never moves a tier when it only observes, so a fixed tier still has a smooth time', () => {
    const governor = new QualityGovernor('quality', { observeOnly: true })
    const state: Run = { governor, now: 0, cost: 2 }
    governor.evaluate(0, 2, false)
    expect(run(state, SLOW_MS, 40)).toBe('quality')
    expect(governor.getSmoothness().ms).toBe(-40 * AUTO_EVAL_MS)
    expect(run(state, FAST_MS, 40)).toBe('quality')
    expect(governor.getSmoothness().ms).toBeGreaterThan(0)
  })
})
