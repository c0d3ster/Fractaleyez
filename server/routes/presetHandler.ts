import type { Request, Response } from 'express'
import { presetService } from '../services/PresetService'

export const presetHandler = async (req: Request, res: Response): Promise<void> => {
  const id = typeof req.query.id === 'string' ? req.query.id.trim() : ''
  if (!id) {
    res.status(400).json({ error: 'id query param is required' })
    return
  }
  try {
    const preset = await presetService.getPresetById(id)
    res.json(preset)
  } catch (err: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = err as any
    res.status(e.status ?? 500).json({ error: e.message ?? 'Internal server error' })
  }
}
