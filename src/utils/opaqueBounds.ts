/** A rectangle inside an image as 0..1 fractions of its width and height (y down). */
export type Bounds = { left: number, top: number, right: number, bottom: number }

export const FULL_BOUNDS: Bounds = { left: 0, top: 0, right: 1, bottom: 1 }

const SAMPLE_SIZE = 128 // the image is read at this many pixels across, whatever its own size
const ALPHA_MIN = 32 // of 255: fainter than this counts as see-through, so a soft shadow does not stretch the box

const cache = new Map<string, Promise<Bounds>>()

/**
 * The smallest rectangle holding every visible pixel. `rgba` is row-major `size` x `size` pixels, 4 bytes each. A blank
 * image has no visible pixels, so it gets the whole frame.
 */
export const findOpaqueBounds = (rgba: ArrayLike<number>, size: number): Bounds => {
  let [minX, minY, maxX, maxY] = [size, size, -1, -1]
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if ((rgba[(y * size + x) * 4 + 3] ?? 0) < ALPHA_MIN) continue
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
    }
  }
  if (maxX < 0) return FULL_BOUNDS
  return { left: minX / size, top: minY / size, right: (maxX + 1) / size, bottom: (maxY + 1) / size }
}

const readBounds = (url: string): Promise<Bounds> => new Promise((resolve) => {
  const image = new Image()
  if (url.startsWith('http')) image.crossOrigin = 'anonymous'
  image.onload = (): void => {
    const canvas = document.createElement('canvas')
    canvas.width = SAMPLE_SIZE
    canvas.height = SAMPLE_SIZE
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) {
      resolve(FULL_BOUNDS)
      return
    }
    try {
      context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE)
      resolve(findOpaqueBounds(context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data, SAMPLE_SIZE))
    } catch {
      resolve(FULL_BOUNDS) // a cross-origin image taints the canvas
    }
  }
  image.onerror = (): void => resolve(FULL_BOUNDS)
  image.src = url
})

/** The visible bounds of the image at `url`, read once per url; the whole frame if it cannot be read. */
export const loadOpaqueBounds = (url: string): Promise<Bounds> => {
  const cached = cache.get(url)
  if (cached) return cached
  const bounds = readBounds(url)
  cache.set(url, bounds)
  return bounds
}
