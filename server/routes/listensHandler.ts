import type { Request, Response } from 'express'
import { AuthUnauthorizedError, verifyAuth } from '../auth'
import { userRepository } from '../repositories/UserRepository'
import { ListenValidationError, listenService } from '../services/ListenService'

/** A listen upload is one song's ticks (base64), about 0.6 to 1.5 MB; Vercel's own body limit (4.5 MB) is the real ceiling there. */
export const MAX_LISTEN_BYTES = '4mb'

// Recording listening sessions is admin-only for now: it stores a lot per song and it is for training the model, not a user feature.
const adminId = async (req: Request, res: Response): Promise<string | null> => {
  let clerkId: string
  try {
    clerkId = await verifyAuth(req.headers.authorization)
  } catch (err) {
    if (err instanceof AuthUnauthorizedError) {
      res.status(401).json({ error: 'Unauthorized' })
      return null
    }
    console.error('listens auth failed:', err)
    res.status(500).json({ error: 'Internal server error' })
    return null
  }
  const user = await userRepository.findByClerkId(clerkId)
  if (user?.isAdmin !== true) {
    res.status(403).json({ error: 'Forbidden' })
    return null
  }
  return clerkId
}

export const saveListenHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = await adminId(req, res)
    if (!userId) return
    const saved = await listenService.saveListen(userId, req.body)
    res.status(200).json(saved)
  } catch (err) {
    if (err instanceof ListenValidationError) {
      res.status(400).json({ error: err.message })
      return
    }
    console.error('Failed to save listen', err)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const spotifyTokenHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = await adminId(req, res)
    if (!userId) return
    const token = await listenService.spotifyToken(userId)
    if (!token) {
      res.status(404).json({ error: 'Spotify is not connected' })
      return
    }
    res.setHeader('Cache-Control', 'no-store')
    res.status(200).json(token)
  } catch (err) {
    console.error('Failed to get the Spotify token', err)
    res.status(500).json({ error: 'Internal server error' })
  }
}
