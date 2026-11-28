import { useEffect, useState } from 'react'

import { startupTimeline } from '../visualization/perf/startup'

// Work the first frames do not need (the Type thumbnails, the Shape pad's map) waits until loading has settled and then runs in idle
// time, one piece per idle period, so it neither delays the first meaningful frame nor lands on the fade-in.

// If the visuals never get going (no WebGL), the work still runs after this long.
const STARTUP_FALLBACK_MS = 15000
// The longest an idle callback may wait before it runs anyway (a busy page never goes idle).
const IDLE_TIMEOUT_MS = 1000

type IdleWindow = { requestIdleCallback?: Window['requestIdleCallback'] }

const nextIdle = (): Promise<void> => new Promise((resolve) => {
  const { requestIdleCallback } = window as IdleWindow
  if (requestIdleCallback) requestIdleCallback.call(window, () => resolve(), { timeout: IDLE_TIMEOUT_MS })
  else window.setTimeout(resolve, 0)
})

let startupOver = false
const settled: Promise<void> = Promise.race([
  startupTimeline.reached('settled'),
  new Promise<void>((resolve) => window.setTimeout(resolve, STARTUP_FALLBACK_MS)),
]).then(() => {
  startupOver = true
})

// Callers wait in line: each resolves in an idle period after the one before it, so the work they start (often a React render) lands
// in a frame of its own instead of all of it in one.
let queue: Promise<void> = settled

/** Resolves in an idle period after startup has settled, and after every earlier caller's. */
export const afterStartup = (): Promise<void> => {
  queue = queue.then(nextIdle)
  return queue
}

/** False until afterStartup() resolves for this component, then true. Already true for one mounted after startup. */
export const useAfterStartup = (): boolean => {
  const [ready, setReady] = useState(startupOver)
  useEffect(() => {
    if (ready) return undefined
    let cancelled = false
    void afterStartup().then(() => {
      if (!cancelled) setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [ready])
  return ready
}
