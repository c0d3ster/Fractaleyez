import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createPackHandler } from '../server/routes/createPackHandler'

export default (req: VercelRequest, res: VercelResponse): Promise<void> =>
  createPackHandler(req as never, res as never)
