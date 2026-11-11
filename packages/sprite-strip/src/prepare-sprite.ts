import { stripEdgeBackground, StripBackgroundOptions } from './strip-background'

export type PrepareSpriteOptions = StripBackgroundOptions & {
  // Set false to only resize/square-pad and skip the background strip step.
  stripBackground?: boolean
}

// Decodes a data URL, downscales it to fit maxSide if needed, and returns a new PNG
// data URL. The particle/point-sprite renderers this was built for always billboard a
// sprite as a square, so rectangular input is centered on a square transparent-padded
// canvas rather than stretched — the padding absorbs the square billboard, and the
// content keeps its original proportions. Background stripping (see stripEdgeBackground)
// runs on the result unless disabled via options.
export const prepareSprite = (dataUrl: string, maxSide: number, options?: PrepareSpriteOptions): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = (): void => {
      const w = img.naturalWidth
      const h = img.naturalHeight
      if (w === 0 || h === 0) {
        resolve(dataUrl)
        return
      }
      const maxDim = Math.max(w, h)
      const scale = maxDim > maxSide ? maxSide / maxDim : 1
      const newW = Math.max(1, Math.round(w * scale))
      const newH = Math.max(1, Math.round(h * scale))
      const side = Math.max(newW, newH)
      const offsetX = Math.floor((side - newW) / 2)
      const offsetY = Math.floor((side - newH) / 2)
      const canvas = document.createElement('canvas')
      canvas.width = side
      canvas.height = side
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) {
        resolve(dataUrl)
        return
      }
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, offsetX, offsetY, newW, newH)
      if (options?.stripBackground !== false) {
        stripEdgeBackground(ctx, side, side, options)
      }
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = (): void => reject(new Error('decode'))
    img.src = dataUrl
  })
}
