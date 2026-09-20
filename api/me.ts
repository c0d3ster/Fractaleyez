import type { VercelRequest, VercelResponse } from '@vercel/node'
import { meHandler, updateMeHandler } from '../server/routes/meHandler'

export default (req: VercelRequest, res: VercelResponse): Promise<void> => {
  if (req.method === 'PATCH') return updateMeHandler(req as never, res as never)
  return meHandler(req as never, res as never)
}
