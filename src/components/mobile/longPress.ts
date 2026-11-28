// Long-press timing, kept free of the DOM so it can be tested with a fake clock. One finger held still for `LONG_PRESS_MS` fires;
// moving it more than `LONG_PRESS_SLOP_PX`, lifting it, or a second finger landing cancels the press (and after a second finger,
// nothing fires again until every finger is up). The canvas's long-press (opening the menu) and the bar's layer buttons use it.

export const LONG_PRESS_MS = 500
export const LONG_PRESS_SLOP_PX = 10

export type LongPressPoint = { x: number; y: number }

/** Runs `fn` after `ms`; returns the cancel. setTimeout in the app, a fake clock in tests. */
export type Schedule = (fn: () => void, ms: number) => () => void

export type LongPressCallbacks = {
  /** A press started that may become a long-press (the ring starts filling here). */
  onStart?: (point: LongPressPoint) => void
  /** The press ended or moved before it fired (the ring goes away). */
  onCancel?: () => void
  /** Held long enough. */
  onFire: (point: LongPressPoint) => void
}

export type LongPress = {
  down: (id: number, point: LongPressPoint) => void
  move: (id: number, point: LongPressPoint) => void
  up: (id: number) => void
  /** Drops any press in progress, without firing (the menu opened another way, the shell turned off). */
  cancel: () => void
}

const defaultSchedule: Schedule = (fn, ms) => {
  const timer = setTimeout(fn, ms)
  return () => clearTimeout(timer)
}

export const createLongPress = (callbacks: LongPressCallbacks, schedule: Schedule = defaultSchedule): LongPress => {
  const down = new Set<number>()
  let press: { id: number; start: LongPressPoint; cancelTimer: () => void } | null = null

  const drop = (notify: boolean): void => {
    if (!press) return
    press.cancelTimer()
    press = null
    if (notify) callbacks.onCancel?.()
  }

  return {
    down: (id, point) => {
      down.add(id)
      if (down.size > 1) {
        drop(true)
        return
      }
      const start = { ...point }
      const cancelTimer = schedule(() => {
        if (press?.id !== id) return
        press = null
        callbacks.onFire(start)
      }, LONG_PRESS_MS)
      press = { id, start, cancelTimer }
      callbacks.onStart?.(start)
    },
    move: (id, point) => {
      if (press?.id !== id) return
      if (Math.hypot(point.x - press.start.x, point.y - press.start.y) > LONG_PRESS_SLOP_PX) drop(true)
    },
    up: (id) => {
      down.delete(id)
      if (press?.id === id) drop(true)
    },
    cancel: () => {
      down.clear()
      drop(true)
    },
  }
}
