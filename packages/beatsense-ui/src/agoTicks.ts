// The time marks along a HUD whose right edge is now: how long ago each mark is, so they stay put while the strip scrolls under them and
// only move when the view is zoomed.

const STEPS_MS = [1000, 2000, 5000, 10000, 15000, 20000, 30000, 60000]

/**
 * The marks for a view `viewMs` long: the smallest round step that gives at most `maxTicks` of them, each a whole number of steps before
 * now and inside the view (now itself is the edge, so it gets none). 5 s at 30 s, 10 s at a minute, 20 s at two minutes.
 */
export const agoTicks = (viewMs: number, maxTicks: number = 6): number[] => {
  if (!(viewMs > 0)) return []
  const step = STEPS_MS.find((candidate) => Math.floor(viewMs / candidate) <= maxTicks) ?? STEPS_MS[STEPS_MS.length - 1]!
  const ticks: number[] = []
  for (let ago = step; ago < viewMs; ago += step) ticks.push(ago)
  return ticks
}

/** A mark's text: -10s, or -1:30 from a minute and a half. */
export const formatAgo = (agoMs: number): string => {
  const seconds = Math.round(agoMs / 1000)
  if (seconds < 60) return `-${seconds}s`
  return `-${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
