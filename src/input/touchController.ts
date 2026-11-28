// The mobile shell's touch gestures on the visual (started from main.ts only when isMobileShell()). One finger steers the camera,
// committing a short tap on release (so a long-press never steers) and tracking a drag; two fingers set Speed, Scale or
// Rotation (classified in touchGestures.ts); a double-tap resets Speed and Rotation to the active preset. Values go through
// window.updateConfigItem, at most once per animation frame, so the config UI and presets stay in sync.

import type { SliderItem } from '../config/configDefaults'
import { applyDelta, GestureKind, isDoubleTap, isTap, Point, PointerTrack, readGesture, TwoFingerKind } from './touchGestures'

export type ActiveGestureKind = 'steer' | Exclude<TwoFingerKind, 'none'> | 'reset'
/** What a readout shows: the gesture and the value it set (the setting's value for speed, scale and rotation; 0 for steer and reset). */
export type ActiveGesture = { kind: ActiveGestureKind; value: number }

/** How long a double-tap's 'reset' stays published, for the readouts to show it. */
export const RESET_SHOWN_MS = 1200

const ITEM_FOR: Record<Exclude<TwoFingerKind, 'none'>, 'speed' | 'scaleFactor' | 'rotationSpeed'> = {
  speed: 'speed',
  scale: 'scaleFactor',
  rotation: 'rotationSpeed',
}

type Tracked = PointerTrack & { startTime: number }
type Mode = 'idle' | 'one' | 'two' | 'ended'

const pointers = new Map<number, Tracked>()
let mode: Mode = 'idle'
let dragging = false
let tapCancelled = false
let locked: GestureKind = 'none'
let startValues: Record<'speed' | 'scaleFactor' | 'rotationSpeed', number> = { speed: 0, scaleFactor: 0, rotationSpeed: 0 }
let lastTap: { time: number; point: Point } | null = null
let paused = false
let active: ActiveGesture | null = null
let resetTimer: ReturnType<typeof setTimeout> | null = null
let pendingWrite: { item: string; value: number } | null = null
let writeFrame: number | null = null
const listeners = new Set<() => void>()

const notify = (): void => listeners.forEach((listener) => listener())

const publish = (next: ActiveGesture | null): void => {
  if (next?.kind === active?.kind && next?.value === active?.value) return
  if (resetTimer !== null && next?.kind !== 'reset') {
    clearTimeout(resetTimer)
    resetTimer = null
  }
  active = next
  notify()
}

/** The gesture in progress and the value it has set, or null. */
export const getGesture = (): ActiveGesture | null => active

/** Calls `listener` whenever the published gesture changes. Returns the unsubscribe. */
export const subscribeGesture = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const flushWrite = (): void => {
  writeFrame = null
  if (!pendingWrite) return
  const { item, value } = pendingWrite
  pendingWrite = null
  window.updateConfigItem?.('user', item, value)
}

const scheduleWrite = (item: string, value: number): void => {
  pendingWrite = { item, value }
  if (writeFrame === null) writeFrame = window.requestAnimationFrame(flushWrite)
}

const cancelWrite = (): void => {
  if (writeFrame !== null) window.cancelAnimationFrame(writeFrame)
  writeFrame = null
  pendingWrite = null
}

const pointOf = (event: PointerEvent): Point => ({ x: event.clientX, y: event.clientY })
const steer = (point: Point): void => window.steerCameraTo?.({ clientX: point.x, clientY: point.y })

/** Forgets the one-finger press in progress, so its release does not steer. A long-press (opening the menu) calls this. */
export const cancelPendingTap = (): void => {
  if (mode === 'one') tapCancelled = true
}

const endTwoFinger = (): void => {
  // The last value still waiting for a frame is written now, so lifting the fingers never loses the end of the gesture.
  if (writeFrame !== null) {
    window.cancelAnimationFrame(writeFrame)
    flushWrite()
  }
  locked = 'none'
  publish(null)
}

const resetAll = (): void => {
  pointers.clear()
  cancelWrite()
  mode = 'idle'
  dragging = false
  tapCancelled = false
  locked = 'none'
  lastTap = null
  publish(null)
}

/** Pauses steering and gestures while the menu sheet is open, like mouse tracking with the config window up. */
export const setGesturesPaused = (next: boolean): void => {
  if (next === paused) return
  paused = next
  if (paused) resetAll()
}

const resetSpeedAndRotation = (): void => {
  window.resetConfigItem?.('user', 'speed')
  window.resetConfigItem?.('user', 'rotationSpeed')
  publish({ kind: 'reset', value: 0 })
  resetTimer = setTimeout(() => {
    resetTimer = null
    if (active?.kind === 'reset') publish(null)
  }, RESET_SHOWN_MS)
}

const startTwoFinger = (): void => {
  mode = 'two'
  dragging = false
  tapCancelled = true
  lastTap = null
  locked = 'none'
  // Measured from where both fingers are when the second lands, not from where the first one first touched.
  pointers.forEach((p) => { p.start = { ...p.current } })
  const { user } = window.config
  startValues = { speed: user.speed.value, scaleFactor: user.scaleFactor.value, rotationSpeed: user.rotationSpeed.value }
  publish(null)
}

const onPointerDown = (event: PointerEvent): void => {
  if (event.pointerType === 'mouse') return
  // With the canvas's touch-action off this also keeps the browser from making up mouse events from the touch.
  event.preventDefault()
  if (paused) return
  ;(event.currentTarget as Element | null)?.setPointerCapture?.(event.pointerId)
  const point = pointOf(event)
  pointers.set(event.pointerId, { start: point, current: point, startTime: event.timeStamp })
  if (pointers.size === 1 && mode === 'idle') {
    mode = 'one'
    dragging = false
    tapCancelled = false
  } else if (pointers.size === 2 && mode === 'one') {
    startTwoFinger()
  } else if (mode === 'two') {
    // A third finger ends the gesture; nothing more happens until every finger is up.
    endTwoFinger()
    mode = 'ended'
  }
}

const onPointerMove = (event: PointerEvent): void => {
  const tracked = pointers.get(event.pointerId)
  if (!tracked || paused) return
  tracked.current = pointOf(event)

  if (mode === 'one') {
    if (tapCancelled) return
    const { delta } = readGesture([tracked])
    if (!dragging && !isTap(0, delta)) {
      dragging = true
      lastTap = null
    }
    if (dragging) {
      steer(tracked.current)
      publish({ kind: 'steer', value: 0 })
    }
    return
  }

  if (mode !== 'two') return
  const reading = readGesture([...pointers.values()], locked)
  if (reading.kind === 'none' || reading.kind === 'steer') return
  locked = reading.kind
  const item = ITEM_FOR[reading.kind]
  const range: SliderItem = window.config.user[item]
  const value = applyDelta(startValues[item], reading.delta, range)
  publish({ kind: reading.kind, value })
  if (value !== window.config.user[item].value || pendingWrite) scheduleWrite(item, value)
}

const onPointerEnd = (event: PointerEvent): void => {
  const tracked = pointers.get(event.pointerId)
  if (!tracked) return
  pointers.delete(event.pointerId)

  if (mode === 'one') {
    mode = 'idle'
    const wasDragging = dragging
    dragging = false
    if (wasDragging) publish(null)
    if (event.type !== 'pointerup' || tapCancelled || wasDragging) return
    const moved = readGesture([tracked]).delta
    if (!isTap(event.timeStamp - tracked.startTime, moved)) {
      // Held too long to be a tap (a long-press the menu did not take): nothing happens.
      lastTap = null
      return
    }
    const tapStart = { time: tracked.startTime, point: tracked.start }
    if (isDoubleTap(lastTap, tapStart)) {
      // The second tap does not steer: the camera stays where the first one sent it.
      lastTap = null
      resetSpeedAndRotation()
      return
    }
    steer(tracked.current)
    lastTap = { time: event.timeStamp, point: tracked.current }
    return
  }

  if (mode === 'two') {
    // Lifting either finger ends the gesture; the one left on the glass does not take over steering.
    endTwoFinger()
    mode = pointers.size === 0 ? 'idle' : 'ended'
    return
  }

  if (pointers.size === 0) mode = 'idle'
}

const preventTouchDefault = (event: TouchEvent): void => {
  if (event.cancelable) event.preventDefault()
}

/**
 * Starts the gestures on `canvas` and turns on the shell's gesture lock (the `mobile-shell` class on the root element sets
 * `touch-action: none` on the canvas and `overscroll-behavior: none` on the body). Returns the stop, which undoes both.
 */
export const startTouchController = (canvas: HTMLCanvasElement): (() => void) => {
  document.documentElement.classList.add('mobile-shell')
  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerup', onPointerEnd)
  canvas.addEventListener('pointercancel', onPointerEnd)
  // iOS Safari still double-tap zooms and makes up mouse events unless the touch events themselves are cancelled.
  canvas.addEventListener('touchstart', preventTouchDefault, { passive: false })
  canvas.addEventListener('touchend', preventTouchDefault, { passive: false })
  window.getGesture = getGesture
  window.subscribeGesture = subscribeGesture
  return () => {
    document.documentElement.classList.remove('mobile-shell')
    canvas.removeEventListener('pointerdown', onPointerDown)
    canvas.removeEventListener('pointermove', onPointerMove)
    canvas.removeEventListener('pointerup', onPointerEnd)
    canvas.removeEventListener('pointercancel', onPointerEnd)
    canvas.removeEventListener('touchstart', preventTouchDefault)
    canvas.removeEventListener('touchend', preventTouchDefault)
    delete window.getGesture
    delete window.subscribeGesture
    resetAll()
  }
}
