import type { Request, Response } from 'express'
import { AuthUnauthorizedError, verifyAuth } from '../auth'
import { presetService } from '../services/PresetService'

export const presetsHandler = async (req: Request, res: Response): Promise<void> => {
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
      console.error('presets auth:', err)
      res.status(500).json({ error: 'Internal server error' })
      return
    }
  }

  const presets = await presetService.listPresetsForViewer(viewerId)
  res.json(presets)
}
