import type { Request, Response } from 'express'
import { Types } from 'mongoose'
import { connectDB } from '../db.js'
import { Preset } from '../models/Preset.js'

/** GET /api/getConfig/:name: a preset's config by id or name. Older than /api/preset, kept for anything that still calls it. */
export const getConfigHandler = async (req: Request, res: Response): Promise<void> => {
  const { name } = req.params
  if (typeof name !== 'string' || !name) {
    res.status(400).json({ error: 'Invalid preset name' })
    return
  }

  try {
    await connectDB()
    const preset = Types.ObjectId.isValid(name) ? await Preset.findById(name) : await Preset.findOne({ name })
    if (!preset) {
      res.status(404).json({ error: `${name} preset could not be found` })
      return
    }
    res.json(preset.config)
  } catch (err) {
    console.error('Failed to fetch preset', err)
    res.status(500).json({ error: 'Internal server error' })
  }
}
