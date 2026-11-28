import { describe, expect, it, vi } from 'vitest'

import type { ActiveGesture } from '../../input/touchController'
import {
  CHIP_FADE_MS,
  createGestureReadout,
  fillFraction,
  formatReadoutValue,
  HIDDEN_READOUT,
  INFO_HOLD_MS,
  PANEL_FADE_MS,
  showsReadout,
} from './gestureReadout'
import type { Schedule } from './longPress'

// A clock the test advances by hand.
const fakeClock = (): { schedule: Schedule; advance: (ms: number) => void; pending: () => number } => {
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
    pending: () => timers.filter((t) => t.live).length,
  }
}

const speed = (value: number): ActiveGesture => ({ kind: 'speed', value })
const setup = () => {
  const clock = fakeClock()
  const readout = createGestureReadout(clock.schedule)
  return { clock, readout }
}

describe('createGestureReadout', () => {
  it('shows the Full panel and its info line while the gesture is active', () => {
    const { readout } = setup()
    readout.update(speed(1.4), 'full')
    expect(readout.get()).toEqual({ style: 'full', kind: 'speed', visible: true, info: 'speed' })
  })

  it('fades the Full panel PANEL_FADE_MS after release and holds the info line INFO_HOLD_MS', () => {
    const { clock, readout } = setup()
    readout.update(speed(1.4), 'full')
    readout.update(null, 'full')
    clock.advance(PANEL_FADE_MS - 1)
    expect(readout.get().visible).toBe(true)
    clock.advance(1)
    expect(readout.get()).toEqual({ style: 'full', kind: 'speed', visible: false, info: 'speed' })
    clock.advance(INFO_HOLD_MS - PANEL_FADE_MS - 1)
    expect(readout.get().info).toBe('speed')
    clock.advance(1)
    expect(readout.get().info).toBeNull()
  })

  it('fades the Limited chip CHIP_FADE_MS after release, with no info line', () => {
    const { clock, readout } = setup()
    readout.update({ kind: 'rotation', value: 0.6 }, 'chip')
    expect(readout.get()).toEqual({ style: 'chip', kind: 'rotation', visible: true, info: null })
    readout.update(null, 'chip')
    clock.advance(CHIP_FADE_MS - 1)
    expect(readout.get().visible).toBe(true)
    clock.advance(1)
    expect(readout.get().visible).toBe(false)
  })

  it('shows nothing for steering in Limited, and nothing at all in None', () => {
    const { readout } = setup()
    readout.update({ kind: 'steer', value: 0 }, 'chip')
    expect(readout.get()).toEqual(HIDDEN_READOUT)
    readout.update(speed(2), 'none')
    expect(readout.get()).toEqual(HIDDEN_READOUT)
  })

  it('replaces a fading readout at once with a new gesture, and its timers no longer fire', () => {
    const { clock, readout } = setup()
    readout.update(speed(1.4), 'full')
    readout.update(null, 'full')
    clock.advance(PANEL_FADE_MS + 100)
    readout.update({ kind: 'scale', value: 900 }, 'full')
    expect(readout.get()).toEqual({ style: 'full', kind: 'scale', visible: true, info: 'scale' })
    clock.advance(INFO_HOLD_MS)
    expect(readout.get()).toEqual({ style: 'full', kind: 'scale', visible: true, info: 'scale' })
  })

  it('takes down a fading chip when a gesture it shows nothing for starts', () => {
    const { readout } = setup()
    readout.update(speed(1.4), 'chip')
    readout.update(null, 'chip')
    readout.update({ kind: 'steer', value: 0 }, 'chip')
    expect(readout.get()).toEqual(HIDDEN_READOUT)
  })

  it('starts each timer once however many releases arrive', () => {
    const { clock, readout } = setup()
    readout.update(speed(1.4), 'full')
    readout.update(null, 'full')
    readout.update(null, 'full')
    expect(clock.pending()).toBe(2)
  })

  it('notifies only when what shows changes', () => {
    const { readout } = setup()
    const listener = vi.fn()
    readout.subscribe(listener)
    readout.update(speed(1.4), 'full')
    readout.update(speed(1.5), 'full')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('clear drops everything and cancels the timers', () => {
    const { clock, readout } = setup()
    readout.update(speed(1.4), 'full')
    readout.update(null, 'full')
    readout.clear()
    expect(readout.get()).toEqual(HIDDEN_READOUT)
    expect(clock.pending()).toBe(0)
  })
})

describe('showsReadout', () => {
  it('Full shows every gesture, the chip all but steering, None nothing', () => {
    expect(showsReadout('full', 'steer')).toBe(true)
    expect(showsReadout('chip', 'steer')).toBe(false)
    expect(showsReadout('chip', 'reset')).toBe(true)
    expect(showsReadout('none', 'speed')).toBe(false)
  })
})

describe('formatReadoutValue', () => {
  it('formats speed to one decimal, scale whole and rotation signed to one decimal', () => {
    expect(formatReadoutValue('speed', 1.44)).toBe('1.4')
    expect(formatReadoutValue('scale', 812.6)).toBe('813')
    expect(formatReadoutValue('rotation', 0.6)).toBe('+0.6')
    expect(formatReadoutValue('rotation', -1.25)).toBe('-1.3')
    expect(formatReadoutValue('rotation', -0.04)).toBe('0.0')
    expect(formatReadoutValue('steer', 0)).toBe('')
  })
})

describe('fillFraction', () => {
  it('maps the value into 0..1, clamped', () => {
    expect(fillFraction(5, 0, 20)).toBe(0.25)
    expect(fillFraction(-3, 0, 20)).toBe(0)
    expect(fillFraction(30, 0, 20)).toBe(1)
    expect(fillFraction(1, 1, 1)).toBe(0)
  })
})
