import type { VercelRequest, VercelResponse } from '@vercel/node'
import { meHandler } from '../server/routes/meHandler'

export default async (req: VercelRequest, res: VercelResponse): Promise<void> => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  await meHandler(req as never, res as never)
}
