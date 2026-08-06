import type { Request, Response } from 'express'
import crypto from 'crypto'
import { imageSize } from 'image-size'
import { AuthUnauthorizedError, verifyAuth } from '../auth'
import { storageService } from '../services/StorageService'

// Mirrors ParticleSpriteHud's client-side MAX_DATA_URL_BYTES — client checks are
// supplementary only, this is the real boundary.
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024
// Well above the 512px client resize target; just a hard ceiling against decompression-bomb-style images.
export const MAX_DECODED_DIMENSION_PX = 4096

const ALLOWED_FORMATS: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
}

export const uploadParticleHandler = async (req: Request, res: Response): Promise<void> => {
  let userId: string
  try {
    userId = await verifyAuth(req.headers.authorization)
  } catch (err) {
    if (err instanceof AuthUnauthorizedError) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    console.error('auth failed:', err)
    res.status(500).json({ error: 'Internal server error' })
    return
  }

  const body = req.body
  if (!Buffer.isBuffer(body) || body.length === 0) {
    res.status(400).json({ error: 'Request body must be raw image bytes' })
    return
  }
  if (body.length > MAX_UPLOAD_BYTES) {
    res.status(413).json({ error: `Image exceeds max size of ${MAX_UPLOAD_BYTES} bytes` })
    return
  }

  let format: string | undefined
  let width: number | undefined
  let height: number | undefined
  try {
    const decoded = imageSize(body)
    format = decoded.type
    width = decoded.width
    height = decoded.height
  } catch {
    res.status(400).json({ error: 'Could not decode image' })
    return
  }

  if (!format || !ALLOWED_FORMATS[format]) {
    res.status(400).json({ error: 'Unsupported image format' })
    return
  }
  if (!width || !height || width > MAX_DECODED_DIMENSION_PX || height > MAX_DECODED_DIMENSION_PX) {
    res.status(400).json({ error: `Image dimensions exceed ${MAX_DECODED_DIMENSION_PX}px` })
    return
  }

  const key = `particles/${userId}/${crypto.randomUUID()}.${format}`

  try {
    // UUID collision is practically unreachable, but the endpoint must never silently overwrite a key.
    if (await storageService.objectExists(key)) {
      res.status(409).json({ error: 'Object already exists' })
      return
    }
    const url = await storageService.putObject(key, body, ALLOWED_FORMATS[format])
    res.status(200).json({ url })
  } catch (err) {
    console.error('Failed to upload particle to R2', err)
    res.status(500).json({ error: 'Internal server error' })
  }
}
