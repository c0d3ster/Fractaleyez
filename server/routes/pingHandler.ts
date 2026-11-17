import type { Request, Response } from 'express'
import { connectDB } from '../db.js'

/** GET /api/ping: a Vercel cron hits this every few days (vercel.json) so the database sees regular traffic. */
export const pingHandler = async (_req: Request, res: Response): Promise<void> => {
  try {
    const db = await connectDB()
    await db.connection.db?.command({ ping: 1 })
    res.status(200).json({ ok: true })
  } catch (err) {
    console.error('Ping failed', err)
    res.status(500).json({ ok: false })
  }
}
