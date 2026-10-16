export type FocusPoint = { x: number, y: number } // 0..1 across the image, y down

// The image is judged at this many pixels across (stretched to a square, like the pad's frame).
export const FOCUS_SAMPLE_SIZE = 256

const CENTER: FocusPoint = { x: 0.5, y: 0.5 }
const cache = new Map<string, Promise<FocusPoint>>()

// Tuned on 56 real images and 58 synthetic ones with known targets (see the notes in the PR that added this).
const RADII = [4, 8, 14, 22, 32] // circle radii the radial-symmetry votes are cast at
const VOTE_THRESHOLD = 0.1 // an edge pixel votes if its gradient is at least this fraction of the strongest
const VOTE_CAP = 9.9 // votes that count at one spot
const BLOB_SCALES = [6, 10, 16] // spot sizes the blob contrast is read at, compared with 2.2x the size
const BLOB_SURROUND = 2.2
const BLOB_FLOOR = 0.005 // a flat logo's faint edge contrast must not be stretched to full strength
const SOLID_BLUR = 6
const SOLID_MIN = 0.97 // a window must be this opaque to count (keeps the silhouette edge and speckle out)
const CENTER_PULL = 0.2 // the pull toward the shape's middle, as a fraction of the image (sigma)
const EDGE_MARGIN = 0.08 // peaks this close to the border are ignored
const PEAK_SHARPNESS = 20 // exponent that keeps the refined point on the peak
const PEAK_RADIUS = 0.08 // the refined point averages the salience within this distance of the peak
const CONFIDENCE_LOW = 0.35 // peak strength below which the shape's middle is used
const CONFIDENCE_HIGH = 0.7 // peak strength above which the peak is used

const smoothstep = (value: number, low: number, high: number): number => {
  const t = Math.min(1, Math.max(0, (value - low) / (high - low)))
  return t * t * (3 - 2 * t)
}

// Round half to even, like numpy, so the votes land where the reference implementation puts them.
const roundHalfEven = (value: number): number => {
  const floor = Math.floor(value)
  const diff = value - floor
  if (diff < 0.5) return floor
  if (diff > 0.5) return floor + 1
  return floor % 2 === 0 ? floor : floor + 1
}

const maxOf = (values: Float64Array): number => values.reduce((max, value) => (value > max ? value : max), -Infinity)

const gaussKernels = new Map<number, Float64Array>()

const kernelFor = (sigma: number): Float64Array => {
  const cached = gaussKernels.get(sigma)
  if (cached) return cached
  const radius = Math.floor(sigma * 3) + 1
  const kernel = new Float64Array(2 * radius + 1)
  let total = 0
  for (let i = 0; i < kernel.length; i += 1) {
    kernel[i] = Math.exp(-0.5 * ((i - radius) / sigma) ** 2)
    total += kernel[i] ?? 0
  }
  for (let i = 0; i < kernel.length; i += 1) kernel[i] = (kernel[i] ?? 0) / total
  gaussKernels.set(sigma, kernel)
  return kernel
}

/** Blurs every row with the border repeated outward, writing the result transposed (so two passes blur both axes). */
const blurRowsTransposed = (values: Float64Array, size: number, kernel: Float64Array): Float64Array => {
  const radius = (kernel.length - 1) / 2
  const line = new Float64Array(size + 2 * radius)
  const out = new Float64Array(values.length)
  for (let y = 0; y < size; y += 1) {
    const row = y * size
    line.fill(values[row] ?? 0, 0, radius)
    for (let x = 0; x < size; x += 1) line[radius + x] = values[row + x] ?? 0
    line.fill(values[row + size - 1] ?? 0, radius + size)
    for (let x = 0; x < size; x += 1) {
      let sum = 0
      for (let k = 0; k < kernel.length; k += 1) sum += (kernel[k] ?? 0) * (line[x + k] ?? 0)
      out[x * size + y] = sum
    }
  }
  return out
}

const SMALL_BLUR_LIMIT = 8 // blurs wider than this are done on a half-size copy, which is far cheaper and changes little

/** Averages 2x2 blocks into a half-size copy. */
const halve = (values: Float64Array, size: number): Float64Array => {
  const half = size / 2
  const out = new Float64Array(half * half)
  for (let y = 0; y < half; y += 1) {
    for (let x = 0; x < half; x += 1) {
      const i = 2 * y * size + 2 * x
      out[y * half + x] = ((values[i] ?? 0) + (values[i + 1] ?? 0) + (values[i + size] ?? 0) + (values[i + size + 1] ?? 0)) / 4
    }
  }
  return out
}

/** Doubles a half-size copy back up with bilinear interpolation (pixel centers line up like a 2x resize). */
const doubleUp = (values: Float64Array, half: number): Float64Array => {
  const size = half * 2
  const out = new Float64Array(size * size)
  const at = (x: number, y: number): number => values[Math.min(half - 1, Math.max(0, y)) * half + Math.min(half - 1, Math.max(0, x))] ?? 0
  for (let y = 0; y < size; y += 1) {
    const sy = (y + 0.5) / 2 - 0.5
    const y0 = Math.floor(sy)
    const fy = sy - y0
    for (let x = 0; x < size; x += 1) {
      const sx = (x + 0.5) / 2 - 0.5
      const x0 = Math.floor(sx)
      const fx = sx - x0
      out[y * size + x] = (1 - fy) * ((1 - fx) * at(x0, y0) + fx * at(x0 + 1, y0)) + fy * ((1 - fx) * at(x0, y0 + 1) + fx * at(x0 + 1, y0 + 1))
    }
  }
  return out
}

/** Separable gaussian blur with the border repeated outward. */
const gauss = (values: Float64Array, size: number, sigma: number): Float64Array => {
  if (sigma > SMALL_BLUR_LIMIT && size % 2 === 0) return doubleUp(gauss(halve(values, size), size / 2, sigma / 2), size / 2)
  const kernel = kernelFor(Math.max(sigma, 0.3))
  return blurRowsTransposed(blurRowsTransposed(values, size, kernel), size, kernel)
}

/** Central differences inside, one-sided at the border (numpy's gradient). Returns [d/dy, d/dx]. */
const gradient = (values: Float64Array, size: number): [Float64Array, Float64Array] => {
  const gy = new Float64Array(values.length)
  const gx = new Float64Array(values.length)
  const at = (x: number, y: number): number => values[y * size + x] ?? 0
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      gx[y * size + x] = x === 0 ? at(1, y) - at(0, y) : x === size - 1 ? at(x, y) - at(x - 1, y) : (at(x + 1, y) - at(x - 1, y)) / 2
      gy[y * size + x] = y === 0 ? at(x, 1) - at(x, 0) : y === size - 1 ? at(x, y) - at(x, y - 1) : (at(x, y + 1) - at(x, y - 1)) / 2
    }
  }
  return [gy, gx]
}

/**
 * Fast radial symmetry: every strong edge pixel votes for the centers of the circles it could be part of, at a few
 * radii, in both directions (light on dark and dark on light). Concentric rings and glowing cores pile up votes.
 */
const radialSymmetry = (lum: Float64Array, solid: Float64Array, size: number): Float64Array => {
  const [gy, gx] = gradient(gauss(lum, size, 1), size)
  const inner = gauss(solid, size, 3)
  const mag = new Float64Array(lum.length)
  for (let i = 0; i < mag.length; i += 1) mag[i] = (inner[i] ?? 0) > SOLID_MIN ? Math.hypot(gx[i] ?? 0, gy[i] ?? 0) : 0
  const threshold = VOTE_THRESHOLD * maxOf(mag)
  const voters: number[] = []
  for (let i = 0; i < mag.length; i += 1) if ((mag[i] ?? 0) > threshold) voters.push(i)

  const total = new Float64Array(lum.length)
  const widest = Math.max(...RADII)
  RADII.forEach((radius) => {
    const votes = new Float64Array(lum.length)
    const strength = new Float64Array(lum.length)
    voters.forEach((i) => {
      const m = mag[i] ?? 0
      const ux = (gx[i] ?? 0) / m
      const uy = (gy[i] ?? 0) / m
      const x = i % size
      const y = Math.floor(i / size)
      for (const sign of [1, -1]) {
        const px = roundHalfEven(x + sign * radius * ux)
        const py = roundHalfEven(y + sign * radius * uy)
        if (px < 0 || px >= size || py < 0 || py >= size) continue
        votes[py * size + px] = (votes[py * size + px] ?? 0) + 1
        strength[py * size + px] = (strength[py * size + px] ?? 0) + m
      }
    })
    const spot = new Float64Array(lum.length)
    for (let i = 0; i < spot.length; i += 1) spot[i] = (Math.min(votes[i] ?? 0, VOTE_CAP) / VOTE_CAP) ** 2 * ((strength[i] ?? 0) / VOTE_CAP)
    const blurred = gauss(spot, size, (2 * radius) / widest)
    for (let i = 0; i < total.length; i += 1) total[i] = (total[i] ?? 0) + (blurred[i] ?? 0)
  })
  const peak = Math.max(maxOf(total), 1e-12)
  return total.map((value) => value / peak)
}

/** How much a spot differs from its surroundings, lighter or darker, at several sizes; only inside solid areas. */
const blobContrast = (lum: Float64Array, solid: Float64Array, size: number): Float64Array => {
  const inside = gauss(solid, size, SOLID_BLUR)
  const out = new Float64Array(lum.length)
  BLOB_SCALES.forEach((scale) => {
    const near = gauss(lum, size, scale)
    const far = gauss(lum, size, BLOB_SURROUND * scale)
    const contrast = new Float64Array(lum.length)
    for (let i = 0; i < contrast.length; i += 1) contrast[i] = (inside[i] ?? 0) > SOLID_MIN ? Math.abs((near[i] ?? 0) - (far[i] ?? 0)) : 0
    const norm = Math.max(maxOf(contrast), BLOB_FLOOR)
    for (let i = 0; i < out.length; i += 1) out[i] = Math.max(out[i] ?? 0, (contrast[i] ?? 0) / norm)
  })
  return out
}

/**
 * Picks the point of an image to zoom into. `rgba` is row-major `size` x `size` pixels, 4 bytes each (straight alpha).
 *
 * One rule for everything: aim at the middle of the visible shape (the center of its bounding box), pulled toward the
 * strongest radial-symmetry and blob peak by how confident that peak is. A logo with a real center (a ringed eye, a
 * glowing core) gets that center; flat text and graphics, where there is nothing to find, get the middle of the shape.
 */
export const findZoomFocus = (rgba: ArrayLike<number>, size: number = FOCUS_SAMPLE_SIZE): FocusPoint => {
  const count = size * size
  const lum = new Float64Array(count)
  const solid = new Float64Array(count)
  let opaque = 0
  let opaqueLum = 0
  let [minX, minY, maxX, maxY] = [size, size, -1, -1]
  for (let i = 0; i < count; i += 1) {
    const alpha = (rgba[i * 4 + 3] ?? 0) / 255
    const mix = (channel: number): number => ((rgba[i * 4 + channel] ?? 0) / 255) * alpha + 0.5 * (1 - alpha)
    lum[i] = 0.299 * mix(0) + 0.587 * mix(1) + 0.114 * mix(2)
    if (alpha <= 0.5) continue
    solid[i] = 1
    opaque += 1
    opaqueLum += lum[i] ?? 0
    const x = i % size
    const y = Math.floor(i / size)
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
  }
  if (opaque === 0) return CENTER
  // See-through pixels take the average of the visible ones, so the silhouette edge is not read as a feature.
  const fill = opaqueLum / opaque
  for (let i = 0; i < count; i += 1) if ((solid[i] ?? 0) === 0) lum[i] = fill

  const middle: FocusPoint = { x: (minX + maxX + 1) / 2 / size, y: (minY + maxY + 1) / 2 / size }

  const symmetry = radialSymmetry(lum, solid, size)
  const smoothSymmetry = gauss(symmetry, size, 6)
  const symmetryPeak = Math.max(maxOf(smoothSymmetry), 1e-12)
  const blob = blobContrast(lum, solid, size)

  // Salience: radial symmetry times blob contrast, leaning toward the middle and away from the border.
  const margin = Math.floor(size * EDGE_MARGIN)
  const salience = new Float64Array(count)
  let peak = 0
  let [peakX, peakY] = [0, 0]
  for (let y = margin; y < size - margin; y += 1) {
    for (let x = margin; x < size - margin; x += 1) {
      const i = y * size + x
      const pull = Math.exp(-(((x + 0.5) / size - middle.x) ** 2 + ((y + 0.5) / size - middle.y) ** 2) / (2 * CENTER_PULL ** 2))
      const value = Math.sqrt((smoothSymmetry[i] ?? 0) / symmetryPeak) * Math.sqrt(blob[i] ?? 0) * pull
      salience[i] = value
      if (value > peak) {
        peak = value
        peakX = x
        peakY = y
      }
    }
  }
  if (peak < 1e-6) return middle

  // Refine the peak to the weighted center of the salience around it.
  const reach = (PEAK_RADIUS * size) ** 2
  let [sum, sumX, sumY] = [0, 0, 0]
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if ((x - peakX) ** 2 + (y - peakY) ** 2 > reach) continue
      const weight = ((salience[y * size + x] ?? 0) / peak) ** PEAK_SHARPNESS
      sum += weight
      sumX += (x + 0.5) * weight
      sumY += (y + 0.5) * weight
    }
  }
  const confidence = smoothstep(peak, CONFIDENCE_LOW, CONFIDENCE_HIGH)
  return {
    x: confidence * (sumX / sum / size) + (1 - confidence) * middle.x,
    y: confidence * (sumY / sum / size) + (1 - confidence) * middle.y,
  }
}

/** Reads the image into a small canvas and finds its zoom point; the center if it cannot be read. Read once per url. */
export const loadZoomFocus = (url: string): Promise<FocusPoint> => {
  const cached = cache.get(url)
  if (cached) return cached
  const focus = new Promise<FocusPoint>((resolve) => {
    const image = new Image()
    if (url.startsWith('http')) image.crossOrigin = 'anonymous'
    image.onload = (): void => {
      const canvas = document.createElement('canvas')
      canvas.width = FOCUS_SAMPLE_SIZE
      canvas.height = FOCUS_SAMPLE_SIZE
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) {
        resolve(CENTER)
        return
      }
      try {
        context.imageSmoothingQuality = 'high'
        context.drawImage(image, 0, 0, FOCUS_SAMPLE_SIZE, FOCUS_SAMPLE_SIZE)
        resolve(findZoomFocus(context.getImageData(0, 0, FOCUS_SAMPLE_SIZE, FOCUS_SAMPLE_SIZE).data))
      } catch {
        resolve(CENTER) // a cross-origin image taints the canvas
      }
    }
    image.onerror = (): void => resolve(CENTER)
    image.src = url
  })
  cache.set(url, focus)
  return focus
}
