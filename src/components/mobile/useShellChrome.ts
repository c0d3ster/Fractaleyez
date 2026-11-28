import { useEffect, useMemo, useSyncExternalStore } from 'react'

import { getGesture, subscribeGesture } from '../../input/touchController'
import { useGestureInfoActive } from './gestureReadoutStore'
import { badgeState, barState, type BadgeState, type BarState, createIdleFade } from './shellChrome'
import { useControlsVisibility } from './useControlsVisibility'

const gestureActive = (): boolean => getGesture() !== null

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

  // Closing the menu, or switching to Full, starts a fresh countdown rather than fading at once.
  useEffect(() => {
    if (visibility.fadeWhenIdle) fade.touch()
  }, [fade, visibility.fadeWhenIdle])

  const inputs = { visibility, idle, gestureActive: gesture, infoActive }
  return { bar: barState(inputs), badge: badgeState(inputs) }
}
