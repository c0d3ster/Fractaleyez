import type { VercelRequest, VercelResponse } from '@vercel/node'
import { MAX_UPLOAD_BYTES, uploadParticleHandler } from '../server/routes/uploadParticleHandler'

// Vercel's default JSON/urlencoded body parser doesn't apply to raw image uploads.
export const config = { api: { bodyParser: false } }

class PayloadTooLargeError extends Error {}

// Unlike server/dev.ts (which gets this for free from express.raw({ limit })), Vercel's raw
// stream has no built-in size cap -- without one, an oversized request buffers fully in memory
// before uploadParticleHandler ever gets a chance to check MAX_UPLOAD_BYTES.
const readRawBody = (req: VercelRequest, maxBytes: number): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let receivedBytes = 0
    req.on('data', (chunk: Buffer) => {
      receivedBytes += chunk.length
      if (receivedBytes > maxBytes) {
        req.destroy()
        reject(new PayloadTooLargeError())
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })

export default async (req: VercelRequest, res: VercelResponse): Promise<void> => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  let body: Buffer
  try {
    body = await readRawBody(req, MAX_UPLOAD_BYTES)
  } catch (err) {
    if (err instanceof PayloadTooLargeError) {
      res.status(413).json({ error: `Image exceeds max size of ${MAX_UPLOAD_BYTES} bytes` })
      return
    }
    throw err
  }
  return uploadParticleHandler({ ...req, body } as never, res as never)
}
