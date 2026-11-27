import { describe, expect, it } from 'vitest'
import { BACKGROUND_WARM_GAP_MS, BACKGROUND_WARM_START_MS, warmInBackground } from './background-warm'

// A scheduler driven by hand: timers fire when the clock passes them, idle callbacks when flushIdle is called.
const manualScheduler = (): {
  scheduler: Parameters<typeof warmInBackground>[1]
  advance: (ms: number) => void
  flushIdle: () => void
} => {
  let now = 0
  let nextHandle = 1
  const timers = new Map<number, { at: number; callback: () => void }>()
  const idles = new Map<number, () => void>()
  return {
    scheduler: {
      setTimeout: (callback, ms) => {
        timers.set(nextHandle, { at: now + ms, callback })
        return nextHandle++
      },
      clearTimeout: (handle) => {
        timers.delete(handle)
      },
      requestIdle: (callback) => {
        idles.set(nextHandle, callback)
        return nextHandle++
      },
      cancelIdle: (handle) => {
        idles.delete(handle)
      },
    },
    advance: (ms) => {
      now += ms
      ;[...timers].filter(([, timer]) => timer.at <= now).forEach(([handle, timer]) => {
        timers.delete(handle)
        timer.callback()
      })
    },
    flushIdle: () => {
      const pending = [...idles]
      idles.clear()
      pending.forEach(([, callback]) => callback())
    },
  }
}

describe('warmInBackground', () => {
  it('waits for startup, then runs one step per idle period with a gap until the step reports it is done', () => {
    const { scheduler, advance, flushIdle } = manualScheduler()
    let remaining = 3
    let runs = 0
    warmInBackground(() => {
      runs++
      remaining--
      return remaining > 0
    }, scheduler)

    advance(BACKGROUND_WARM_START_MS - 1)
    flushIdle()
    expect(runs).toBe(0)
    advance(1)
    flushIdle()
    expect(runs).toBe(1)
    flushIdle()
    expect(runs).toBe(1)
    advance(BACKGROUND_WARM_GAP_MS)
    flushIdle()
    expect(runs).toBe(2)
    advance(BACKGROUND_WARM_GAP_MS)
    flushIdle()
    expect(runs).toBe(3)
    advance(BACKGROUND_WARM_GAP_MS)
    flushIdle()
    expect(runs).toBe(3)
  })

  it('stops when cancelled', () => {
    const { scheduler, advance, flushIdle } = manualScheduler()
    let runs = 0
    const stop = warmInBackground(() => {
      runs++
      return true
    }, scheduler)
    advance(BACKGROUND_WARM_START_MS)
    stop()
    flushIdle()
    advance(BACKGROUND_WARM_GAP_MS)
    flushIdle()
    expect(runs).toBe(0)
  })
})
