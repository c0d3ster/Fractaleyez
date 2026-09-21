import type { VercelRequest, VercelResponse } from '@vercel/node'
import { clerkWebhookHandler, MAX_WEBHOOK_BYTES } from '../server/routes/clerkWebhookHandler'

// Vercel's default JSON body parser would consume the raw body svix needs to verify.
export const config = { api: { bodyParser: false } }

class PayloadTooLargeError extends Error {}

const readRawBody = (req: VercelRequest, maxBytes: number): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let receivedBytes = 0
    req.on('data', (chunk: Buffer) => {
      receivedBytes += chunk.length
      if (receivedBytes > maxBytes) {
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
    body = await readRawBody(req, MAX_WEBHOOK_BYTES)
  } catch (err) {
    if (err instanceof PayloadTooLargeError) {
      res.status(413).json({ error: `Payload exceeds max size of ${MAX_WEBHOOK_BYTES} bytes` })
      return
    }
    throw err
  }
  return clerkWebhookHandler({ ...req, body } as never, res as never)
}
