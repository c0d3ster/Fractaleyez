import type { VercelRequest, VercelResponse } from '@vercel/node'
import { saveListenHandler } from '../server/routes/listensHandler'

export default async (req: VercelRequest, res: VercelResponse): Promise<void> => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  return saveListenHandler(req as never, res as never)
}
