import { describe, expect, it, vi } from 'vitest'

import { CONTROLS_FADE_MS, controlsVisibility } from '../../config/mobileControls.config'
import type { Schedule } from './longPress'
import { badgeState, barState, ChromeInputs, createIdleFade } from './shellChrome'

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

  it('does not fade while the menu is open', () => {
    expect(barState(inputs({ visibility: controlsVisibility('full', true), idle: true }))).toBe('shown')
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
