import type { VercelRequest, VercelResponse } from '@vercel/node'
import { connectDB } from '../server/db'
import { Preset } from '../server/models/Preset'

export default async (_req: VercelRequest, res: VercelResponse): Promise<void> => {
  await connectDB()
  const presets = await Preset.find({}, 'name pack sprite userId')
  res.json(presets)
}
