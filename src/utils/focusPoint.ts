export type FocusPoint = { x: number, y: number } // 0..1 across the image, y down

const SAMPLE_SIZE = 48 // the image is judged at this many pixels across
const CELL = 6 // detail is scored in windows this many samples wide
const CENTER_BIAS = 0.35 // how much a window loses at the far edge, so ties and faint detail favor the middle
const MIN_ALPHA = 0.75 // windows that are less opaque than this on average are skipped

const CENTER: FocusPoint = { x: 0.5, y: 0.5 }

/**
 * Picks the spot to zoom into: the window of the image with the most local contrast (luminance spread) that is mostly
 * opaque, nudged toward the center. For an eye or a face that lands on the iris or the features, not the margin.
 * `rgba` is row-major `size` x `size` pixels, 4 bytes each. Falls back to the center for a blank or flat image.
 */
export const findFocusInRgba = (rgba: ArrayLike<number>, size: number): FocusPoint => {
  const luma = (x: number, y: number): number => {
    const i = (y * size + x) * 4
    return (0.299 * (rgba[i] ?? 0) + 0.587 * (rgba[i + 1] ?? 0) + 0.114 * (rgba[i + 2] ?? 0)) / 255
  }
  const alpha = (x: number, y: number): number => (rgba[(y * size + x) * 4 + 3] ?? 0) / 255

  const half = CELL / 2
  const best = { score: 0, point: CENTER }
  for (let cy = 0; cy + CELL <= size; cy += 1) {
    for (let cx = 0; cx + CELL <= size; cx += 1) {
      const values: number[] = []
      let opaque = 0
      for (let y = cy; y < cy + CELL; y += 1) {
        for (let x = cx; x < cx + CELL; x += 1) {
          values.push(luma(x, y))
          opaque += alpha(x, y)
        }
      }
      if (opaque / values.length < MIN_ALPHA) continue
      const mean = values.reduce((sum, value) => sum + value, 0) / values.length
      const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
      const point = { x: (cx + half) / size, y: (cy + half) / size }
      const fromCenter = Math.hypot(point.x - 0.5, point.y - 0.5) / Math.SQRT1_2
      const score = Math.sqrt(variance) * (1 - CENTER_BIAS * fromCenter)
      if (score > best.score) {
        best.score = score
        best.point = point
      }
    }
  }
  return best.point
}

/** Reads the image into a small canvas and finds its focus point; the center if the canvas is unavailable. */
export const findFocusPoint = (source: CanvasImageSource): FocusPoint => {
  const canvas = document.createElement('canvas')
  canvas.width = SAMPLE_SIZE
  canvas.height = SAMPLE_SIZE
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return CENTER
  try {
    context.drawImage(source, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE)
    return findFocusInRgba(context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data, SAMPLE_SIZE)
  } catch {
    return CENTER // a cross-origin image taints the canvas
  }
}
