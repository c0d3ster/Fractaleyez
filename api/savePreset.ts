import type { VercelRequest, VercelResponse } from '@vercel/node'
import { savePresetHandler } from '../server/routes/savePresetHandler'

export default async (req: VercelRequest, res: VercelResponse): Promise<void> => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  return savePresetHandler(req as never, res as never)
}
