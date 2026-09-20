import type { VercelRequest, VercelResponse } from '@vercel/node'
import { meHandler } from '../server/routes/meHandler'

export default (req: VercelRequest, res: VercelResponse): Promise<void> =>
  meHandler(req as never, res as never)
