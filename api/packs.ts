import type { VercelRequest, VercelResponse } from '@vercel/node'
import { packsHandler } from '../server/routes/packsHandler'

export default (req: VercelRequest, res: VercelResponse): Promise<void> =>
  packsHandler(req as never, res as never)
