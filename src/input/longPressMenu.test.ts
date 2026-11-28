import { describe, expect, it, vi } from 'vitest'

import { LONG_PRESS_MS, Schedule } from '../components/mobile/longPress'
import { createLongPressMenu, getLongPressRing } from './longPressMenu'

const fakeClock = (): { schedule: Schedule; advance: (ms: number) => void } => {
  let now = 0
  const timers: { at: number; fn: () => void; live: boolean }[] = []
  return {
    schedule: (fn, ms) => {
      const timer = { at: now + ms, fn, live: true }
      timers.push(timer)
      return () => { timer.live = false }
    },
    advance: (ms) => {
      now += ms
      timers.filter((t) => t.live && t.at <= now).forEach((t) => { t.live = false; t.fn() })
    },
  }
}

const touch = (pointerId: number, clientX: number, clientY: number, pointerType = 'touch') => ({ pointerId, pointerType, clientX, clientY })

const setup = (menuOpen = false) => {
  const clock = fakeClock()
  const deps = { openMenu: vi.fn(), cancelPendingTap: vi.fn(), isMenuOpen: vi.fn(() => menuOpen), schedule: clock.schedule, now: () => 0 }
  return { clock, deps, handlers: createLongPressMenu(deps) }
}

describe('long-press menu', () => {
  it('opens the menu after a hold and takes the press from the gesture engine first, so it never steers', () => {
    const { clock, deps, handlers } = setup()
    handlers.down(touch(1, 120, 300))
    expect(getLongPressRing()).toMatchObject({ x: 120, y: 300 })
    clock.advance(LONG_PRESS_MS)
    expect(deps.cancelPendingTap).toHaveBeenCalledTimes(1)
    expect(deps.openMenu).toHaveBeenCalledTimes(1)
    expect(deps.cancelPendingTap.mock.invocationCallOrder[0]).toBeLessThan(deps.openMenu.mock.invocationCallOrder[0] ?? 0)
    expect(getLongPressRing()).toBeNull()
    handlers.up(touch(1, 120, 300))
    expect(deps.openMenu).toHaveBeenCalledTimes(1)
  })

  it('leaves a tap to the gesture engine', () => {
    const { clock, deps, handlers } = setup()
    handlers.down(touch(1, 0, 0))
    clock.advance(100)
    handlers.up(touch(1, 0, 0))
    expect(getLongPressRing()).toBeNull()
    clock.advance(LONG_PRESS_MS)
    expect(deps.openMenu).not.toHaveBeenCalled()
    expect(deps.cancelPendingTap).not.toHaveBeenCalled()
  })

  it('does nothing for a drag or a second finger', () => {
    const { clock, deps, handlers } = setup()
    handlers.down(touch(1, 0, 0))
    handlers.move(touch(1, 30, 0))
    clock.advance(LONG_PRESS_MS)
    handlers.up(touch(1, 30, 0))
    handlers.down(touch(2, 0, 0))
    handlers.down(touch(3, 80, 0))
    clock.advance(LONG_PRESS_MS)
    expect(deps.openMenu).not.toHaveBeenCalled()
  })

  it('is ignored while the menu is open, and for a mouse', () => {
    const open = setup(true)
    open.handlers.down(touch(1, 0, 0))
    open.clock.advance(LONG_PRESS_MS)
    expect(open.deps.openMenu).not.toHaveBeenCalled()

    const mouse = setup()
    mouse.handlers.down(touch(1, 0, 0, 'mouse'))
    mouse.clock.advance(LONG_PRESS_MS)
    expect(mouse.deps.openMenu).not.toHaveBeenCalled()
  })
})
