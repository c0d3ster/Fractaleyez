import type { Request, Response } from 'express'
import { AuthUnauthorizedError, verifyAuth } from '../auth'
import { packService } from '../services/PackService'

export const myPacksHandler = async (req: Request, res: Response): Promise<void> => {
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

  const packs = await packService.listMyPacks(userId)
  res.json(packs)
}
