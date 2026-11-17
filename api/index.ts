import { createApp } from '../server/app.js'

// The whole API as one Vercel function: vercel.json rewrites /api/* here and Express routes on the original path. Vercel's
// own body parsing is off so Express parses (and the webhooks get their raw bytes for signature checks).
export const config = { api: { bodyParser: false } }

export default createApp()
