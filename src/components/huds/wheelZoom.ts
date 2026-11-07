// The Beat and Section HUDs zoom the time they show with the wheel, and a double-click puts it back to the default.

// How far one notch of the wheel zooms (a notch is a deltaY of about 100): about 20%.
const ZOOM_PER_DELTA = 0.002

export type ZoomRange = { minMs: number; maxMs: number }

/** The view after a wheel turn of `deltaY`: down (positive) shows more time, up shows less, kept within the range. */
export const zoomView = (viewMs: number, deltaY: number, { minMs, maxMs }: ZoomRange): number =>
  Math.min(maxMs, Math.max(minMs, viewMs * Math.exp(deltaY * ZOOM_PER_DELTA)))

/**
 * Calls `onWheel` with each wheel turn over `element`. A native listener, not React's onWheel, which is passive and so cannot stop the page
 * scrolling under the HUD. Returns the unsubscribe.
 */
export const listenWheel = (element: HTMLElement, onWheel: (deltaY: number) => void): (() => void) => {
  const handle = (event: WheelEvent): void => {
    event.preventDefault()
    onWheel(event.deltaY)
  }
  element.addEventListener('wheel', handle, { passive: false })
  return () => element.removeEventListener('wheel', handle)
}
