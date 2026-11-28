import { useEffect, useMemo, useSyncExternalStore } from 'react'

import { getGesture, subscribeGesture } from '../../input/touchController'
import { useGestureInfoActive } from './gestureReadoutStore'
import { badgeState, barState, type BadgeState, type BarState, type ChromeTarget, createIdleFade, createWakeGuard } from './shellChrome'
import { useControlsVisibility } from './useControlsVisibility'

const gestureActive = (): boolean => getGesture() !== null

const CHROME_SELECTORS = ['[data-mobile-bar]', '[data-mobile-badge]'] as const

/** The bar and badge as they are drawn now: the state each element carries and its box. */
const chromeTargets = (): ChromeTarget[] =>
  CHROME_SELECTORS.flatMap((selector) => {
    const element = document.querySelector<HTMLElement>(selector)
    const state = element?.dataset.mobileBar ?? element?.dataset.mobileBadge
    if (!element || (state !== 'faded' && state !== 'shown' && state !== 'dim' && state !== 'away')) return []
    return [{ state, rect: element.getBoundingClientRect() }]
  })

/** What the bar and badge show right now: the controls mode, the idle fade, the active gesture and Full's info line together. */
export const useShellChrome = (): { bar: BarState; badge: BadgeState } => {
  const visibility = useControlsVisibility()
  const infoActive = useGestureInfoActive()
  const gesture = useSyncExternalStore(subscribeGesture, gestureActive, gestureActive)
  const fade = useMemo(() => createIdleFade(), [])
  const idle = useSyncExternalStore(fade.subscribe, fade.isIdle, fade.isIdle)

  // Any touch anywhere (the visual, the bar, the badge) brings them back and restarts the countdown; so does letting go, so a long
  // hold is not idle time.
  useEffect(() => {
    const touch = (): void => fade.touch()
    const options = { capture: true, passive: true }
    document.addEventListener('pointerdown', touch, options)
    document.addEventListener('pointerup', touch, options)
    return () => {
      document.removeEventListener('pointerdown', touch, options)
      document.removeEventListener('pointerup', touch, options)
      fade.stop()
    }
  }, [fade])

  // A touch on the faded bar or badge only brings them back (shellChrome.ts#wakesOnly). The window's capture phase runs before the
  // document's and the canvas's listeners, so stopping the touch there keeps it from the touch controller, the long-press and the
  // buttons underneath, from the press to the lift.
  useEffect(() => {
    const guard = createWakeGuard()
    const take = (event: PointerEvent): void => {
      event.stopImmediatePropagation()
      if (event.cancelable) event.preventDefault()
    }
    const down = (event: PointerEvent): void => {
      if (event.pointerType === 'mouse') return
      if (!guard.down(event.pointerId, { x: event.clientX, y: event.clientY }, chromeTargets())) return
      take(event)
      fade.touch()
    }
    const move = (event: PointerEvent): void => {
      if (guard.owns(event.pointerId)) take(event)
    }
    const end = (event: PointerEvent): void => {
      if (!guard.owns(event.pointerId)) return
      take(event)
      guard.end(event.pointerId)
      fade.touch()
    }
    const options = { capture: true }
    window.addEventListener('pointerdown', down, options)
    window.addEventListener('pointermove', move, options)
    window.addEventListener('pointerup', end, options)
    window.addEventListener('pointercancel', end, options)
    return () => {
      window.removeEventListener('pointerdown', down, options)
      window.removeEventListener('pointermove', move, options)
      window.removeEventListener('pointerup', end, options)
      window.removeEventListener('pointercancel', end, options)
    }
  }, [fade])

  // Closing the menu, or switching to Full, starts a fresh countdown rather than fading at once.
  useEffect(() => {
    if (visibility.fadeWhenIdle) fade.touch()
  }, [fade, visibility.fadeWhenIdle])

  const inputs = { visibility, idle, gestureActive: gesture, infoActive }
  return { bar: barState(inputs), badge: badgeState(inputs) }
}
