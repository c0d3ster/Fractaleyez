import type { Request, Response } from 'express'
import { presetService } from '../services/PresetService'
import { AuthUnauthorizedError, verifyAuth } from '../auth'

export const savePresetHandler = async (req: Request, res: Response): Promise<void> => {
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { name, pack, config, force } = req.body as any
  if (!name || typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'name is required' })
    return
  }

  try {
    const preset = await presetService.savePreset({
      name: name.trim(),
      pack: typeof pack === 'string' ? pack.trim() : '',
      config,
      userId,
      force: !!force,
    })
    res.status(200).json({ id: preset._id, name: preset.name })
  } catch (err: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = err as any
    if (e.status === 409) {
      res.status(409).json({ error: 'Preset already exists', name: e.presetName })
    } else {
      console.error('Failed to save preset', err)
      res.status(500).json({ error: 'Internal server error' })
    }
  }
}
