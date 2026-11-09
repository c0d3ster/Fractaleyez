import type { VercelRequest, VercelResponse } from '@vercel/node'
import { spotifyTokenHandler } from '../../server/routes/listensHandler'

export default async (req: VercelRequest, res: VercelResponse): Promise<void> => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  return spotifyTokenHandler(req as never, res as never)
}
