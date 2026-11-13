/** What `trackCanvasResolution` hands back: `apply` scales a draw to the HUD's own units, `stop` ends the tracking. */
export type CanvasResolution = {
  apply: (ctx: CanvasRenderingContext2D) => void
  stop: () => void
}

/**
 * Keeps a HUD canvas sharp at whatever size it is shown: its pixel buffer follows its size on screen times the device pixel ratio (never
 * smaller than the HUD's own `width` by `height`, so a narrow config column looks as it always has), and `apply`, called at the start of
 * every draw, scales the context so the drawing code keeps working in those units. `onResize` runs after the buffer changes size (which
 * clears it), so a HUD that only draws on a change can draw again.
 */
export const trackCanvasResolution = (canvas: HTMLCanvasElement, width: number, height: number, onResize?: () => void): CanvasResolution => {
  const resize = (): void => {
    const shown = canvas.clientWidth
    if (shown <= 0) return
    const pixelWidth = Math.max(width, Math.round(shown * (window.devicePixelRatio || 1)))
    const pixelHeight = Math.round((pixelWidth * height) / width)
    if (canvas.width === pixelWidth && canvas.height === pixelHeight) return
    canvas.width = pixelWidth
    canvas.height = pixelHeight
    onResize?.()
  }
  resize()
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize)
  observer?.observe(canvas)
  // A page zoom or a move to a screen with another pixel ratio changes the ratio without always resizing the element.
  window.addEventListener('resize', resize)
  return {
    apply: (ctx): void => ctx.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0),
    stop: (): void => {
      observer?.disconnect()
      window.removeEventListener('resize', resize)
    },
  }
}
