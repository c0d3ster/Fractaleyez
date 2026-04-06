import type { VercelRequest, VercelResponse } from '@vercel/node'
import { Types } from 'mongoose'
import { connectDB } from '../../server/db'
import { Preset } from '../../server/models/Preset'

export default async (req: VercelRequest, res: VercelResponse): Promise<void> => {
  const { name } = req.query
  if (!name || Array.isArray(name)) {
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
