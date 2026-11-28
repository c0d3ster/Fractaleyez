// Long-press on the visual opens the menu sheet, in every on-screen controls mode. Started on the pipeline canvas next to the
// touch gestures (main.ts, only while the mobile shell is active). While a press is held the ring around the finger fills
// (LongPressRing, through getLongPressRing); when it fires, the press is taken from the gesture engine (cancelPendingTap) so its
// release never steers. Touches on the bar or the sheet never reach the canvas, and a press while the menu is open is ignored.

import { createLongPress, LongPressPoint, Schedule } from '../components/mobile/longPress'
import { isMenuOpen, openMenu } from '../components/mobile/menuBus'
import { cancelPendingTap } from './touchController'

/** Where the ring is drawn (client coordinates of the press), or null when no press is held. */
export type LongPressRing = LongPressPoint & { startedAt: number }

let ring: LongPressRing | null = null
const ringListeners = new Set<() => void>()

const publishRing = (next: LongPressRing | null): void => {
  if (next === ring) return
  ring = next
  ringListeners.forEach((listener) => listener())
}

export const getLongPressRing = (): LongPressRing | null => ring

export const subscribeLongPressRing = (listener: () => void): (() => void) => {
  ringListeners.add(listener)
  return () => ringListeners.delete(listener)
}

type PointerLike = Pick<PointerEvent, 'pointerId' | 'pointerType' | 'clientX' | 'clientY'>

export type LongPressMenuDeps = {
  openMenu: (page?: string) => void
  cancelPendingTap: () => void
  isMenuOpen: () => boolean
  schedule?: Schedule
  now?: () => number
}

/** The long-press's pointer handlers, with what they call passed in (tested with fakes). */
export const createLongPressMenu = (deps: LongPressMenuDeps) => {
  const now = deps.now ?? (() => performance.now())
  const press = createLongPress({
    onStart: (start) => publishRing({ ...start, startedAt: now() }),
    onCancel: () => publishRing(null),
    onFire: () => {
      publishRing(null)
      deps.cancelPendingTap()
      deps.openMenu()
    },
  }, deps.schedule)
  const point = (event: PointerLike): LongPressPoint => ({ x: event.clientX, y: event.clientY })
  return {
    down: (event: PointerLike): void => {
      if (event.pointerType === 'mouse' || deps.isMenuOpen()) return
      press.down(event.pointerId, point(event))
    },
    move: (event: PointerLike): void => press.move(event.pointerId, point(event)),
    up: (event: PointerLike): void => press.up(event.pointerId),
    cancel: press.cancel,
  }
}

// The hold time runs out on a timer, but moves and lifts already queued may not have been handled yet on a busy main thread. The
// browser dispatches pending input before a frame's animation callbacks, so firing on the next frame lets them cancel first.
const scheduleAfterInput: Schedule = (fn, ms) => {
  let frame: number | null = null
  const timer = setTimeout(() => { frame = window.requestAnimationFrame(fn) }, ms)
  return () => {
    clearTimeout(timer)
    if (frame !== null) window.cancelAnimationFrame(frame)
  }
}

/** Starts the long-press on `canvas`. Returns the stop. */
export const startLongPressMenu = (canvas: HTMLCanvasElement): (() => void) => {
  const handlers = createLongPressMenu({ openMenu, cancelPendingTap, isMenuOpen, schedule: scheduleAfterInput })
  canvas.addEventListener('pointerdown', handlers.down)
  canvas.addEventListener('pointermove', handlers.move)
  canvas.addEventListener('pointerup', handlers.up)
  canvas.addEventListener('pointercancel', handlers.up)
  return () => {
    canvas.removeEventListener('pointerdown', handlers.down)
    canvas.removeEventListener('pointermove', handlers.move)
    canvas.removeEventListener('pointerup', handlers.up)
    canvas.removeEventListener('pointercancel', handlers.up)
    handlers.cancel()
  }
}
