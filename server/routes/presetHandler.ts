import type { Request, Response } from 'express'
import { presetService } from '../services/PresetService'

export const presetHandler = async (req: Request, res: Response): Promise<void> => {
  const name = req.query.name as string | undefined
  if (!name) {
    res.status(400).json({ error: 'name query param is required' })
    return
  }
  try {
    const preset = await presetService.getPreset(name)
    res.json(preset)
  } catch (err: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = err as any
    res.status(e.status ?? 500).json({ error: e.message ?? 'Internal server error' })
  }
}
