import type { Request, Response } from 'express'
import { presetService } from '../services/PresetService'

export const presetsHandler = async (_req: Request, res: Response): Promise<void> => {
  const presets = await presetService.listPresets()
  res.json(presets)
}
