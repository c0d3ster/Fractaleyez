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

  const body = req.body && typeof req.body === 'object' ? req.body : {}
  const { name, pack, config, force: forceRaw } = body as Record<string, unknown>
  if (!name || typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'name is required' })
    return
  }

  const force = forceRaw === true || forceRaw === 'true'

  try {
    const preset = await presetService.savePreset({
      name: name.trim(),
      pack: typeof pack === 'string' ? pack.trim() : '',
      config: (config ?? {}) as Record<string, unknown>,
      userId,
      force,
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
