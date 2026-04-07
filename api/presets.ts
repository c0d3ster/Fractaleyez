import type { VercelRequest, VercelResponse } from '@vercel/node'
import { presetsHandler } from '../server/routes/presetsHandler'

export default (req: VercelRequest, res: VercelResponse): Promise<void> =>
  presetsHandler(req as never, res as never)
