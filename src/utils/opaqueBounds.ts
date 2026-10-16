/** A rectangle inside an image as 0..1 fractions of its width and height (y down). */
export type Bounds = { left: number, top: number, right: number, bottom: number }

export const FULL_BOUNDS: Bounds = { left: 0, top: 0, right: 1, bottom: 1 }

/** An image's visible part and its shape: width over height, which is 1 for a square or an unreadable image. */
export type ImageShape = { bounds: Bounds, aspect: number }

export const SQUARE_SHAPE: ImageShape = { bounds: FULL_BOUNDS, aspect: 1 }

const SAMPLE_SIZE = 128 // the image is read at this many pixels across, whatever its own size
const ALPHA_MIN = 32 // of 255: fainter than this counts as see-through, so a soft shadow does not stretch the box

const cache = new Map<string, Promise<ImageShape>>()

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

const readShape = (url: string): Promise<ImageShape> => new Promise((resolve) => {
  const image = new Image()
  if (url.startsWith('http')) image.crossOrigin = 'anonymous'
  image.onload = (): void => {
    const aspect = image.naturalWidth > 0 && image.naturalHeight > 0 ? image.naturalWidth / image.naturalHeight : 1
    const canvas = document.createElement('canvas')
    canvas.width = SAMPLE_SIZE
    canvas.height = SAMPLE_SIZE
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) {
      resolve({ bounds: FULL_BOUNDS, aspect })
      return
    }
    try {
      context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE)
      resolve({ bounds: findOpaqueBounds(context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data, SAMPLE_SIZE), aspect })
    } catch {
      resolve({ bounds: FULL_BOUNDS, aspect }) // a cross-origin image taints the canvas
    }
  }
  image.onerror = (): void => resolve(SQUARE_SHAPE)
  image.src = url
})

/** The visible bounds and shape of the image at `url`, read once per url; the whole square frame if it cannot be read. */
export const loadImageShape = (url: string): Promise<ImageShape> => {
  const cached = cache.get(url)
  if (cached) return cached
  const shape = readShape(url)
  cache.set(url, shape)
  return shape
}
