// The live widgets in the expanded config window (frequency bars, camera pad, shape pad, perf readout) all poll the
// visualizer. Each on its own timer, their repaints land on different frames, so the popup repaints on nearly every
// display frame, and that repaint load starves the background video. One shared tick makes them all update (and
// repaint) together, at most UI_TICK_HZ times a second.
const UI_TICK_HZ = 20
const UI_TICK_MS = 1000 / UI_TICK_HZ

type UiTickListener = (now: number) => void

const listeners = new Set<UiTickListener>()
let timer: ReturnType<typeof setInterval> | undefined

const tick = (): void => {
  const now = performance.now()
  listeners.forEach((listener) => listener(now))
}

export const subscribeUiTick = (listener: UiTickListener): (() => void) => {
  listeners.add(listener)
  if (timer === undefined) timer = setInterval(tick, UI_TICK_MS)
  return () => {
    listeners.delete(listener)
    if (listeners.size > 0 || timer === undefined) return
    clearInterval(timer)
    timer = undefined
  }
}
