import type { VercelRequest, VercelResponse } from '@vercel/node'
import { myPacksHandler } from '../server/routes/myPacksHandler'

export default (req: VercelRequest, res: VercelResponse): Promise<void> =>
  myPacksHandler(req as never, res as never)
