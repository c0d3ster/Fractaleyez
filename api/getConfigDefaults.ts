import type { VercelRequest, VercelResponse } from '@vercel/node'
import { connectDB } from '../server/db'
import { Preset } from '../server/models/Preset'

export default async (_req: VercelRequest, res: VercelResponse): Promise<void> => {
  await connectDB()
  const preset = await Preset.findOne({ name: 'default' })
  if (!preset) {
    res.status(404).send('default preset not found')
    return
  }
  res.json(preset.config)
}
