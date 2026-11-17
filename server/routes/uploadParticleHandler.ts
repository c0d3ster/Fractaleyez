import type { Request, Response } from 'express'
import { imageSize } from 'image-size'
import { AuthUnauthorizedError, verifyAuth } from '../auth.js'
import { uploadService } from '../services/UploadService.js'
import { isQuotaExceededError } from '../services/EntitlementService.js'
import { isUploadKind } from '../models/Upload.js'

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

  // `?kind=avatar` is the one-time copy of the Clerk profile photo (src/utils/clerkPhotoLogo.ts); everything else is a sprite.
  const kind = isUploadKind(req.query?.kind) ? req.query.kind : 'sprite'

  try {
    const url = await uploadService.uploadParticle({ userId, body, format, contentType: ALLOWED_FORMATS[format], kind })
    res.status(200).json({ url })
  } catch (err) {
    if (isQuotaExceededError(err)) {
      res.status(403).json(err.toJSON())
      return
    }
    if ((err as { status?: number }).status === 409) {
      res.status(409).json({ error: 'Object already exists' })
      return
    }
    console.error('Failed to upload particle to R2', err)
    res.status(500).json({ error: 'Internal server error' })
  }
}
