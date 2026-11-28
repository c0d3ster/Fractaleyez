import { describe, expect, it, vi } from 'vitest'

import { CONTROLS_FADE_MS, controlsVisibility } from '../../config/mobileControls.config'
import type { Schedule } from './longPress'
import { badgeState, barState, ChromeInputs, type ChromeTarget, createIdleFade, createWakeGuard, wakesOnly } from './shellChrome'

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

const inputs = (patch: Partial<ChromeInputs> = {}): ChromeInputs => ({
  visibility: controlsVisibility('full', false),
  idle: false,
  gestureActive: false,
  infoActive: false,
  ...patch,
})

describe('barState', () => {
  it('shows at rest in Full and fades when idle', () => {
    expect(barState(inputs())).toBe('shown')
    expect(barState(inputs({ idle: true }))).toBe('faded')
  })

  it('slides away during a gesture and while the info line shows, idle or not', () => {
    expect(barState(inputs({ gestureActive: true }))).toBe('away')
    expect(barState(inputs({ infoActive: true }))).toBe('away')
    expect(barState(inputs({ infoActive: true, idle: true }))).toBe('away')
  })

  it('is off in Limited and None, menu open or not', () => {
    for (const mode of ['limited', 'none'] as const) {
      expect(barState(inputs({ visibility: controlsVisibility(mode, false) }))).toBe('off')
      expect(barState(inputs({ visibility: controlsVisibility(mode, true) }))).toBe('off')
    }
  })

  it('is off in Full while a sheet is open', () => {
    expect(barState(inputs({ visibility: controlsVisibility('full', true) }))).toBe('off')
    expect(barState(inputs({ visibility: controlsVisibility('full', true), idle: true }))).toBe('off')
  })
})

describe('badgeState', () => {
  it('shows, fades when idle, and dims during a gesture in Full', () => {
    expect(badgeState(inputs())).toBe('shown')
    expect(badgeState(inputs({ idle: true }))).toBe('faded')
    expect(badgeState(inputs({ gestureActive: true }))).toBe('dim')
  })

  it('stays put while the info line shows', () => {
    expect(badgeState(inputs({ infoActive: true }))).toBe('shown')
  })

  it('shows in Limited and None only while the menu is open, without fading', () => {
    expect(badgeState(inputs({ visibility: controlsVisibility('limited', false) }))).toBe('off')
    expect(badgeState(inputs({ visibility: controlsVisibility('none', true), idle: true }))).toBe('shown')
  })
})

describe('createIdleFade', () => {
  it('goes idle the fade time after it starts', () => {
    const clock = fakeClock()
    const fade = createIdleFade(clock.schedule)
    const listener = vi.fn()
    fade.subscribe(listener)
    clock.advance(CONTROLS_FADE_MS - 1)
    expect(fade.isIdle()).toBe(false)
    clock.advance(1)
    expect(fade.isIdle()).toBe(true)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('a touch brings it back and restarts the countdown', () => {
    const clock = fakeClock()
    const fade = createIdleFade(clock.schedule)
    clock.advance(CONTROLS_FADE_MS)
    fade.touch()
    expect(fade.isIdle()).toBe(false)
    clock.advance(CONTROLS_FADE_MS - 1)
    fade.touch()
    clock.advance(CONTROLS_FADE_MS - 1)
    expect(fade.isIdle()).toBe(false)
    clock.advance(1)
    expect(fade.isIdle()).toBe(true)
  })

  it('a touch while shown notifies nobody', () => {
    const clock = fakeClock()
    const fade = createIdleFade(clock.schedule)
    const listener = vi.fn()
    fade.subscribe(listener)
    fade.touch()
    expect(listener).not.toHaveBeenCalled()
  })

  it('stop cancels the countdown', () => {
    const clock = fakeClock()
    const fade = createIdleFade(clock.schedule)
    fade.stop()
    clock.advance(CONTROLS_FADE_MS)
    expect(fade.isIdle()).toBe(false)
  })
})

const BAR_RECT = { left: 0, top: 700, right: 390, bottom: 844 }
const BADGE_RECT = { left: 330, top: 20, right: 374, bottom: 64 }
const chrome = (bar: ChromeTarget['state'], badge: ChromeTarget['state']): ChromeTarget[] => [
  { state: bar, rect: BAR_RECT },
  { state: badge, rect: BADGE_RECT },
]

describe('wakesOnly', () => {
  it('takes a touch on the faded bar or the faded badge', () => {
    expect(wakesOnly({ x: 100, y: 760 }, chrome('faded', 'faded'))).toBe(true)
    expect(wakesOnly({ x: 350, y: 40 }, chrome('faded', 'faded'))).toBe(true)
  })

  it('leaves a touch on the open visual to steer, faded or not', () => {
    expect(wakesOnly({ x: 200, y: 400 }, chrome('faded', 'faded'))).toBe(false)
    expect(wakesOnly({ x: 200, y: 400 }, chrome('shown', 'shown'))).toBe(false)
  })

  it('leaves a touch on a shown bar or badge to the controls, as before', () => {
    expect(wakesOnly({ x: 100, y: 760 }, chrome('shown', 'shown'))).toBe(false)
    expect(wakesOnly({ x: 350, y: 40 }, chrome('shown', 'shown'))).toBe(false)
  })

  it('does not take a touch where the bar slid away or the badge is dimmed for a gesture', () => {
    expect(wakesOnly({ x: 100, y: 760 }, chrome('away', 'dim'))).toBe(false)
    expect(wakesOnly({ x: 350, y: 40 }, chrome('away', 'dim'))).toBe(false)
  })

  it('judges each element by its own state', () => {
    expect(wakesOnly({ x: 100, y: 760 }, chrome('shown', 'faded'))).toBe(false)
    expect(wakesOnly({ x: 350, y: 40 }, chrome('shown', 'faded'))).toBe(true)
  })

  it('takes nothing when neither is drawn', () => {
    expect(wakesOnly({ x: 100, y: 760 }, [])).toBe(false)
  })
})

describe('createWakeGuard', () => {
  it('owns a taken touch from the press to the lift', () => {
    const guard = createWakeGuard()
    expect(guard.down(1, { x: 100, y: 760 }, chrome('faded', 'faded'))).toBe(true)
    expect(guard.owns(1)).toBe(true)
    guard.end(1)
    expect(guard.owns(1)).toBe(false)
  })

  it('keeps owning the taken touch after the chrome comes back, so its lift does not tap the button now under it', () => {
    const guard = createWakeGuard()
    guard.down(1, { x: 100, y: 760 }, chrome('faded', 'faded'))
    expect(guard.owns(1)).toBe(true)
    // The next touch, with the bar shown, reaches the bar.
    expect(guard.down(2, { x: 100, y: 760 }, chrome('shown', 'shown'))).toBe(false)
    expect(guard.owns(2)).toBe(false)
  })

  it('does not own a touch it left alone', () => {
    const guard = createWakeGuard()
    expect(guard.down(3, { x: 200, y: 400 }, chrome('faded', 'faded'))).toBe(false)
    expect(guard.owns(3)).toBe(false)
  })
})
