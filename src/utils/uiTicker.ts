import { observeOnScreen } from './onScreen'

// The live widgets in the expanded config window (frequency bars, camera pad, shape pad, perf readout) all poll the
// visualizer. Each on its own timer, their repaints land on different frames, so the popup repaints on nearly every
// display frame, and that repaint load starves the background video. One shared tick makes them all update (and
// repaint) together, at most the quality tier's `uiTickHz` times a second, and a widget that is scrolled out of view
// is not ticked at all.
const DEFAULT_UI_TICK_HZ = 20

type UiTickListener = (now: number) => void

type Subscription = {
  listener: UiTickListener
  visible: boolean
}

const subscriptions = new Set<Subscription>()
let timer: ReturnType<typeof setTimeout> | undefined

// The visualizer lives in the main window; a popped-out config window reads its quality tier through window.opener.
const tickIntervalMs = (): number => {
  const hz = (window.opener ?? window).getQuality?.()?.profile.uiTickHz ?? DEFAULT_UI_TICK_HZ
  return 1000 / hz
}

const tick = (): void => {
  timer = setTimeout(tick, tickIntervalMs())
  const now = performance.now()
  subscriptions.forEach(({ listener, visible }) => {
    if (visible) listener(now)
  })
}

/**
 * Calls `listener` on the shared tick. Given the `element` the widget draws into, it is skipped while that is off screen
 * and called once as soon as it is back, so it catches up before it is seen.
 */
export const subscribeUiTick = (listener: UiTickListener, element?: Element | null): (() => void) => {
  const subscription: Subscription = { listener, visible: true }
  subscriptions.add(subscription)
  const stopObserving = element
    ? observeOnScreen(element, (visible) => {
      const wasHidden = !subscription.visible
      subscription.visible = visible
      if (visible && wasHidden) listener(performance.now())
    })
    : undefined
  if (timer === undefined) timer = setTimeout(tick, tickIntervalMs())
  return () => {
    stopObserving?.()
    subscriptions.delete(subscription)
    if (subscriptions.size > 0 || timer === undefined) return
    clearTimeout(timer)
    timer = undefined
  }
}
