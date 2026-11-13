import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { animationFrameTicker } from '../src/ticker'

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

describe('animationFrameTicker', () => {
  let clock: ReturnType<typeof frames>

  beforeEach(() => {
    clock = frames()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('calls every subscriber on each frame from one shared loop', () => {
    const a: number[] = []
    const b: number[] = []
    const stopA = animationFrameTicker((now) => a.push(now))
    const stopB = animationFrameTicker((now) => b.push(now))
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
    const stopA = animationFrameTicker((now) => calls.push(now))
    const stopB = animationFrameTicker(() => undefined)
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
    const stopFirst = animationFrameTicker(listener)
    const stopSecond = animationFrameTicker(listener)
    stopFirst()
    clock.run(16)
    expect(calls).toEqual([16])
    stopSecond()
    expect(clock.pending()).toBe(0)
  })
})
