import type { Request, Response } from 'express'
import { AuthUnauthorizedError, verifyAuth } from '../auth'
import { packService } from '../services/PackService'

export const packsHandler = async (req: Request, res: Response): Promise<void> => {
  let viewerId: string | null = null
  const auth = req.headers.authorization
  if (auth) {
    try {
      viewerId = await verifyAuth(auth)
    } catch (err) {
      if (err instanceof AuthUnauthorizedError) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }
      console.error('packs auth:', err)
      res.status(500).json({ error: 'Internal server error' })
      return
    }
  }

  try {
    const packs = await packService.listPacks(viewerId)
    res.json(packs)
  } catch (err) {
    console.error('Failed to list packs:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
}
