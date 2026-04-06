import type { VercelRequest, VercelResponse } from '@vercel/node'
import { connectDB } from '../server/db'
import { Preset } from '../server/models/Preset'
import { verifyAuth } from '../server/auth'

export default async (req: VercelRequest, res: VercelResponse): Promise<void> => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  let userId: string
  try {
    userId = await verifyAuth(req.headers.authorization)
  } catch {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const { name, pack, config, force } = req.body
  if (!name || typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'name is required' })
    return
  }

  try {
    await connectDB()
    const trimmedName = name.trim()

    if (!force) {
      const existing = await Preset.findOne({ name: trimmedName, userId })
      if (existing) {
        res.status(409).json({ error: 'Preset already exists', name: trimmedName })
        return
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sprite = (config as any)?.particle?.sprites?.value?.[0] ?? 'fractaleye.png'
    const preset = await Preset.findOneAndUpdate(
      { name: trimmedName, userId },
      { name: trimmedName, userId, pack: typeof pack === 'string' ? pack.trim() : '', sprite, config },
      { upsert: true, new: true, runValidators: true }
    )
    res.status(200).json({ id: preset._id, name: preset.name })
  } catch (err) {
    console.error('Failed to save preset', err)
    res.status(500).json({ error: 'Internal server error' })
  }
}
