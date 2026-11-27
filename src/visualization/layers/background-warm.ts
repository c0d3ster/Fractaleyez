// After startup, work that would otherwise freeze a frame the first time it is needed (a shader compile) runs one step at a time while the
// page is idle, so startup only pays for what is on screen and the rest is ready before anyone reaches for it.

// Wait this long after startup before the first step, so the first frames and the UI settle first.
export const BACKGROUND_WARM_START_MS = 2000
// At least this long between steps, so each one's freeze stands alone instead of several adding up to a visible stall.
export const BACKGROUND_WARM_GAP_MS = 400
// The longest an idle callback may wait before it runs anyway (a busy page never goes idle).
const IDLE_TIMEOUT_MS = 1000

type Scheduler = {
  setTimeout: (callback: () => void, ms: number) => number
  clearTimeout: (handle: number) => void
  requestIdle: (callback: () => void) => number
  cancelIdle: (handle: number) => void
}

// Safari has no requestIdleCallback, so fall back to a timer there.
type IdleWindow = { requestIdleCallback?: Window['requestIdleCallback']; cancelIdleCallback?: Window['cancelIdleCallback'] }

const browserScheduler = (): Scheduler => {
  const { requestIdleCallback, cancelIdleCallback } = window as IdleWindow
  return {
    setTimeout: (callback, ms) => window.setTimeout(callback, ms),
    clearTimeout: (handle) => window.clearTimeout(handle),
    requestIdle: (callback) => (requestIdleCallback
      ? requestIdleCallback.call(window, callback, { timeout: IDLE_TIMEOUT_MS })
      : window.setTimeout(callback, 0)),
    cancelIdle: (handle) => (cancelIdleCallback ? cancelIdleCallback.call(window, handle) : window.clearTimeout(handle)),
  }
}

/**
 * Runs `step` in idle time until it returns false: the first after BACKGROUND_WARM_START_MS, then one per idle period at least
 * BACKGROUND_WARM_GAP_MS apart. Returns a function that stops it.
 */
export const warmInBackground = (step: () => boolean, scheduler: Scheduler = browserScheduler()): (() => void) => {
  let timer: number | null = null
  let idle: number | null = null
  let stopped = false
  const queue = (delayMs: number): void => {
    timer = scheduler.setTimeout(() => {
      timer = null
      idle = scheduler.requestIdle(() => {
        idle = null
        if (!stopped && step()) queue(BACKGROUND_WARM_GAP_MS)
      })
    }, delayMs)
  }
  queue(BACKGROUND_WARM_START_MS)
  return () => {
    stopped = true
    if (timer !== null) scheduler.clearTimeout(timer)
    if (idle !== null) scheduler.cancelIdle(idle)
  }
}
