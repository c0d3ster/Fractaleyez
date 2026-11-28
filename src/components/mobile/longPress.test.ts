import { describe, expect, it, vi } from 'vitest'

import { createLongPress, LONG_PRESS_MS, LONG_PRESS_SLOP_PX, Schedule } from './longPress'

// A clock the test advances by hand.
const fakeClock = (): { schedule: Schedule; advance: (ms: number) => void } => {
  let now = 0
  let timers: { at: number; fn: () => void; live: boolean }[] = []
  return {
    schedule: (fn, ms) => {
      const timer = { at: now + ms, fn, live: true }
      timers.push(timer)
      return () => { timer.live = false }
    },
    advance: (ms) => {
      now += ms
      const due = timers.filter((t) => t.live && t.at <= now)
      timers = timers.filter((t) => !due.includes(t))
      due.forEach((t) => { t.live = false; t.fn() })
    },
  }
}

const setup = () => {
  const clock = fakeClock()
  const onStart = vi.fn()
  const onCancel = vi.fn()
  const onFire = vi.fn()
  const press = createLongPress({ onStart, onCancel, onFire }, clock.schedule)
  return { clock, onStart, onCancel, onFire, press }
}

describe('createLongPress', () => {
  it('fires once after the hold time, at the press point', () => {
    const { clock, onStart, onFire, press } = setup()
    press.down(1, { x: 100, y: 200 })
    expect(onStart).toHaveBeenCalledWith({ x: 100, y: 200 })
    clock.advance(LONG_PRESS_MS - 1)
    expect(onFire).not.toHaveBeenCalled()
    clock.advance(1)
    expect(onFire).toHaveBeenCalledTimes(1)
    expect(onFire).toHaveBeenCalledWith({ x: 100, y: 200 })
    clock.advance(LONG_PRESS_MS)
    expect(onFire).toHaveBeenCalledTimes(1)
  })

  it('does not fire for a tap', () => {
    const { clock, onCancel, onFire, press } = setup()
    press.down(1, { x: 0, y: 0 })
    clock.advance(120)
    press.up(1)
    expect(onCancel).toHaveBeenCalledTimes(1)
    clock.advance(LONG_PRESS_MS)
    expect(onFire).not.toHaveBeenCalled()
  })

  it('tolerates small movement and cancels past the slop', () => {
    const { clock, onFire, press } = setup()
    press.down(1, { x: 0, y: 0 })
    press.move(1, { x: LONG_PRESS_SLOP_PX, y: 0 })
    clock.advance(LONG_PRESS_MS)
    expect(onFire).toHaveBeenCalledTimes(1)

    press.up(1)
    press.down(2, { x: 0, y: 0 })
    press.move(2, { x: 8, y: 8 })
    clock.advance(LONG_PRESS_MS)
    expect(onFire).toHaveBeenCalledTimes(1)
  })

  it('cancels when a second finger lands, until every finger is up', () => {
    const { clock, onCancel, onFire, press } = setup()
    press.down(1, { x: 0, y: 0 })
    press.down(2, { x: 50, y: 0 })
    expect(onCancel).toHaveBeenCalledTimes(1)
    press.up(2)
    clock.advance(LONG_PRESS_MS)
    expect(onFire).not.toHaveBeenCalled()
    press.up(1)
    press.down(3, { x: 0, y: 0 })
    clock.advance(LONG_PRESS_MS)
    expect(onFire).toHaveBeenCalledTimes(1)
  })

  it('ignores moves and lifts of other pointers', () => {
    const { clock, onFire, press } = setup()
    press.down(1, { x: 0, y: 0 })
    press.move(7, { x: 500, y: 500 })
    press.up(7)
    clock.advance(LONG_PRESS_MS)
    expect(onFire).toHaveBeenCalledTimes(1)
  })

  it('cancel drops the press without firing', () => {
    const { clock, onCancel, onFire, press } = setup()
    press.down(1, { x: 0, y: 0 })
    press.cancel()
    expect(onCancel).toHaveBeenCalledTimes(1)
    clock.advance(LONG_PRESS_MS)
    expect(onFire).not.toHaveBeenCalled()
  })
})
