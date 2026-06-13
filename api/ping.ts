import type { VercelRequest, VercelResponse } from '@vercel/node'
import { connectDB } from '../server/db'

export default async (_req: VercelRequest, res: VercelResponse): Promise<void> => {
  await connectDB()
  res.status(200).json({ ok: true })
}
