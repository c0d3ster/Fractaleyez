import type { VercelRequest, VercelResponse } from '@vercel/node'
import { uploadParticleHandler } from '../server/routes/uploadParticleHandler'

// Vercel's default JSON/urlencoded body parser doesn't apply to raw image uploads.
export const config = { api: { bodyParser: false } }

const readRawBody = (req: VercelRequest): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })

export default async (req: VercelRequest, res: VercelResponse): Promise<void> => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  const body = await readRawBody(req)
  return uploadParticleHandler({ ...req, body } as never, res as never)
}
