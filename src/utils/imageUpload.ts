/** Downscales a data URL so its longer side is at most maxSide, preserving aspect ratio; returns it unchanged if already within bounds. */
export const prepareImageDataUrl = (dataUrl: string, maxSide: number): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const w = img.naturalWidth
      const h = img.naturalHeight
      const maxDim = Math.max(w, h)
      if (maxDim <= maxSide || maxDim === 0) {
        resolve(dataUrl)
        return
      }
      const scale = maxSide / maxDim
      const newW = Math.max(1, Math.round(w * scale))
      const newH = Math.max(1, Math.round(h * scale))
      const canvas = document.createElement('canvas')
      canvas.width = newW
      canvas.height = newH
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(dataUrl)
        return
      }
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, 0, 0, newW, newH)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => reject(new Error('decode'))
    img.src = dataUrl
  })
}

export const dataUrlToBlob = async (dataUrl: string): Promise<Blob> => {
  const res = await fetch(dataUrl)
  return res.blob()
}
