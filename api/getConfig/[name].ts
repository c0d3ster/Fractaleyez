import type { VercelRequest, VercelResponse } from '@vercel/node'
import { connectDB } from '../../server/db'
import { Preset } from '../../server/models/Preset'

export default async (req: VercelRequest, res: VercelResponse): Promise<void> => {
  await connectDB()
  const { name } = req.query as { name: string }
  const preset = await Preset.findOne({ name })
  if (!preset) {
    res.status(404).send(`${name} preset could not be found`)
    return
  }
  res.json(preset.config)
}
