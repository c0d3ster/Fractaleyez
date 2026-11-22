import type { Request, Response } from 'express'
import { AuthUnauthorizedError, verifyAuth } from '../auth.js'
import { isUploadInUseError, uploadService } from '../services/UploadService.js'

/** Answers 401/500 itself and returns null when the request has no valid user. */
const authenticate = async (req: Request, res: Response): Promise<string | null> => {
  try {
    return await verifyAuth(req.headers.authorization)
  } catch (err) {
    if (err instanceof AuthUnauthorizedError) {
      res.status(401).json({ error: 'Unauthorized' })
      return null
    }
    console.error('uploads auth failed:', err)
    res.status(500).json({ error: 'Internal server error' })
    return null
  }
}

/** GET /api/uploads: the signed-in user's own uploads, newest first. */
export const listUploadsHandler = async (req: Request, res: Response): Promise<void> => {
  const userId = await authenticate(req, res)
  if (!userId) return
  try {
    res.status(200).json({ uploads: await uploadService.listUploads(userId) })
  } catch (err) {
    console.error('Failed to list uploads', err)
    res.status(500).json({ error: 'Internal server error' })
  }
}

/** DELETE /api/uploads/:id: the owner deletes one upload. 409 names what still uses it. */
export const deleteUploadHandler = async (req: Request, res: Response): Promise<void> => {
  const userId = await authenticate(req, res)
  if (!userId) return
  const id = req.params?.id
  if (typeof id !== 'string' || id.length === 0) {
    res.status(400).json({ error: 'Missing upload id' })
    return
  }
  try {
    await uploadService.deleteUpload(userId, id)
    res.status(204).end()
  } catch (err) {
    if (isUploadInUseError(err)) {
      res.status(409).json(err.toJSON())
      return
    }
    if ((err as { status?: number }).status === 404) {
      res.status(404).json({ error: 'Upload not found' })
      return
    }
    console.error('Failed to delete upload', err)
    res.status(500).json({ error: 'Internal server error' })
  }
}
