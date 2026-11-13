import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createFrameTicker, type Ticker } from '../src/ticker'

// A stand-in for the browser's animation frames: the test runs the pending frame by hand.
const frames = (): { run: (now: number) => void; pending: () => number } => {
  const callbacks = new Map<number, FrameRequestCallback>()
  let nextId = 1
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback): number => {
    const id = nextId++
    callbacks.set(id, callback)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number): void => {
    callbacks.delete(id)
  })
  return {
    run: (now: number): void => {
      const due = [...callbacks.values()]
      callbacks.clear()
      due.forEach((callback) => callback(now))
    },
    pending: (): number => callbacks.size,
  }
}

describe('createFrameTicker', () => {
  let clock: ReturnType<typeof frames>
  // Fast enough to tick on every one of the test's frames.
  let ticker: Ticker

  beforeEach(() => {
    clock = frames()
    ticker = createFrameTicker(1000)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('calls every subscriber on each frame from one shared loop', () => {
    const a: number[] = []
    const b: number[] = []
    const stopA = ticker((now) => a.push(now))
    const stopB = ticker((now) => b.push(now))
    expect(clock.pending()).toBe(1)
    clock.run(16)
    clock.run(32)
    expect(a).toEqual([16, 32])
    expect(b).toEqual([16, 32])
    stopA()
    stopB()
  })

  it('stops the loop once the last subscriber leaves', () => {
    const calls: number[] = []
    const stopA = ticker((now) => calls.push(now))
    const stopB = ticker(() => undefined)
    stopA()
    clock.run(16)
    expect(calls).toEqual([])
    expect(clock.pending()).toBe(1)
    stopB()
    expect(clock.pending()).toBe(0)
  })

  it('keeps a listener subscribed twice until both are unsubscribed', () => {
    const calls: number[] = []
    const listener = (now: number): void => {
      calls.push(now)
    }
    const stopFirst = ticker(listener)
    const stopSecond = ticker(listener)
    stopFirst()
    clock.run(16)
    expect(calls).toEqual([16])
    stopSecond()
    expect(clock.pending()).toBe(0)
  })

  it('ticks at most at its rate, whatever the display does', () => {
    const calls: number[] = []
    const thirty = createFrameTicker(30)
    const stop = thirty((now) => calls.push(now))
    // A 240 Hz display: a frame every 4.2 ms for a tenth of a second.
    for (let f = 1; f <= 24; f++) clock.run(f * (1000 / 240))
    expect(calls.length).toBe(3)
    stop()
  })
})
