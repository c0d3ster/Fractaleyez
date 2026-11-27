import type { ColorState } from '../../config/colorState'
import { sampleLut } from '../../config/paletteLut'

// How the shape pad's map and the fractal Type thumbnails turn escape counts into pixels, so both follow the live palette the same way.

// The color only depends on the smooth escape count, so each recolor builds a small lookup table over the
// count's range and the per-pixel work is one table read. Recoloring runs on every beat (the hue jumps) on the
// same main thread as the visualizer, so the old per-pixel exp and three cos calls (about 25 ms per recolor)
// were stalling the video texture.
// This pad runs on the same main thread as the visualizer and its video texture (the config popup is rendered by
// the main window's JS), so its per-frame work is kept small: recoloring and overlay/readout updates are rate
// limited, and the hue has to move a visible amount before the map is repainted.
export const MIN_RECOLOR_INTERVAL_MS = 250
export const MIN_RECOLOR_HUE_STEP = 0.03
const COLOR_LUT_SIZE = 2048
// Escape counts past this all get the last color.
export const MAP_MAX_ITER = 120
const COLOR_LUT_SCALE = (COLOR_LUT_SIZE - 1) / MAP_MAX_ITER

// The map's colors for one escape count: the same palette lookup as the Julia shader, dimmed toward the set.
const colorAt = (nu: number, hue: number, color: ColorState): [number, number, number] => {
  const glow = 0.18 + 0.82 * Math.exp(-nu * 0.16)
  const [red, green, blue] = sampleLut(color.lut, nu * 0.05 * color.cycles + hue + color.phase)
  return [red * 255 * glow, green * 255 * glow, blue * 255 * glow]
}

const buildColorLut = (hue: number, color: ColorState): Uint8ClampedArray => {
  const lut = new Uint8ClampedArray(COLOR_LUT_SIZE * 3)
  const { saturation } = color
  for (let i = 0; i < COLOR_LUT_SIZE; i++) {
    const [red, green, blue] = colorAt(i / COLOR_LUT_SCALE, hue, color)
    // Same grayscale blend the Julia shader uses for the Saturation slider.
    const luma = 0.299 * red + 0.587 * green + 0.114 * blue
    lut[i * 3] = luma + (red - luma) * saturation
    lut[i * 3 + 1] = luma + (green - luma) * saturation
    lut[i * 3 + 2] = luma + (blue - luma) * saturation
  }
  return lut
}

/** Paints smooth escape counts (-1 for points that never escape) with the palette at this hue. */
export const drawEscapeCounts = (canvas: HTMLCanvasElement, iterations: Float32Array, hue: number, color: ColorState): void => {
  const context = canvas.getContext('2d')
  if (!context) return
  const { width, height } = canvas
  const image = context.createImageData(width, height)
  const lut = buildColorLut(hue, color)
  const pixelCount = width * height
  for (let pixel = 0; pixel < pixelCount; pixel++) {
    const nu = iterations[pixel] ?? -1
    const offset = pixel * 4
    if (nu < 0) {
      image.data[offset] = 4
      image.data[offset + 1] = 5
      image.data[offset + 2] = 10
    } else {
      const lutOffset = Math.min(COLOR_LUT_SIZE - 1, Math.round(nu * COLOR_LUT_SCALE)) * 3
      image.data[offset] = lut[lutOffset] ?? 0
      image.data[offset + 1] = lut[lutOffset + 1] ?? 0
      image.data[offset + 2] = lut[lutOffset + 2] ?? 0
    }
    image.data[offset + 3] = 255
  }
  context.putImageData(image, 0, 0)
}
