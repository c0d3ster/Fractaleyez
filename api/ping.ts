import type { VercelRequest, VercelResponse } from '@vercel/node'
import { connectDB } from '../server/db'

export default async (_req: VercelRequest, res: VercelResponse): Promise<void> => {
  const db = await connectDB()
  await db.connection.db.command({ ping: 1 })
  res.status(200).json({ ok: true })
}
