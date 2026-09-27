import type { VercelRequest, VercelResponse } from '@vercel/node'
import { meHandler, updateMeHandler } from '../server/routes/meHandler'

export default (req: VercelRequest, res: VercelResponse): Promise<void> => {
  if (req.method === 'GET') return meHandler(req as never, res as never)
  if (req.method === 'PATCH') return updateMeHandler(req as never, res as never)
  res.status(405).json({ error: 'Method not allowed' })
  return Promise.resolve()
}
