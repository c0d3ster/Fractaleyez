import { useEffect, useState } from 'react'

// The pop-out is a separate window; the visualizers (and these flags) live in the window that opened it.
const mainWindow = (): Window => window.opener ?? window

export const VISUALIZER_ACTIVE_EVENT = 'visualizer-active-change'

export type VisualizerActive = { julia: boolean; orbit: boolean }

const read = (target: Window): VisualizerActive => ({
  julia: target.juliaActive ?? false,
  orbit: target.orbitActive ?? true,
})

// Which visualizers are on screen (Julia, and Orbit, i.e. Hopalong; both show together in 'both' mode).
// main.ts owns the flags and fires the event when they change.
export const useVisualizerActive = (): VisualizerActive => {
  const [active, setActive] = useState<VisualizerActive>(() => read(mainWindow()))

  useEffect(() => {
    const target = mainWindow()
    const sync = (): void => setActive(read(target))
    sync()
    target.addEventListener(VISUALIZER_ACTIVE_EVENT, sync)
    return () => target.removeEventListener(VISUALIZER_ACTIVE_EVENT, sync)
  }, [])

  return active
}
