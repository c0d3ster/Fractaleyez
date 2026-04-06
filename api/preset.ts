import type { VercelRequest, VercelResponse } from '@vercel/node'
import { presetHandler } from '../server/routes/presetHandler'

export default (req: VercelRequest, res: VercelResponse): Promise<void> =>
  presetHandler(req as never, res as never)
