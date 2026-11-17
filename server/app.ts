import express, { type ErrorRequestHandler, type Express } from 'express'
import { presetsHandler } from './routes/presetsHandler.js'
import { presetHandler } from './routes/presetHandler.js'
import { savePresetHandler } from './routes/savePresetHandler.js'
import { packsHandler } from './routes/packsHandler.js'
import { myPacksHandler } from './routes/myPacksHandler.js'
import { createPackHandler } from './routes/createPackHandler.js'
import { uploadParticleHandler, MAX_UPLOAD_BYTES } from './routes/uploadParticleHandler.js'
import { meHandler, updateMeHandler } from './routes/meHandler.js'
import { clerkWebhookHandler, MAX_WEBHOOK_BYTES } from './routes/clerkWebhookHandler.js'
import { stripeWebhookHandler, MAX_STRIPE_WEBHOOK_BYTES } from './routes/stripeWebhookHandler.js'
import { billingActionHandler, billingStatusHandler } from './routes/billingHandler.js'
import { pingHandler } from './routes/pingHandler.js'
import { getConfigHandler } from './routes/getConfigHandler.js'

type BodyParserError = Error & { type?: string; status?: number }

// body-parser's own errors (oversized or malformed bodies) as JSON, like every other API response. Anything else is a 500.
const handleErrors: ErrorRequestHandler = (err: BodyParserError, _req, res, next) => {
  if (res.headersSent) {
    next(err)
    return
  }
  if (err.type === 'entity.too.large') {
    res.status(413).json({ error: 'Payload too large' })
    return
  }
  if (err.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Malformed request body' })
    return
  }
  console.error('Unhandled API error', err)
  res.status(500).json({ error: 'Internal server error' })
}

/**
 * Every API route, for both runtimes: server/dev.ts serves it locally with the static files, and api/index.ts is the single
 * Vercel function (vercel.json rewrites /api/* to it). Some routes have two paths because the old one-file-per-function
 * layout named them after their files (/api/createPack, /api/myPacks); both stay so nothing that calls either breaks.
 */
export const createApp = (): Express => {
  const app = express()
  app.disable('x-powered-by')

  // Before the JSON parser: svix and Stripe verify signatures over the exact request bytes.
  app.post('/api/clerkWebhook', express.raw({ type: 'application/json', limit: MAX_WEBHOOK_BYTES }), clerkWebhookHandler)
  app.post('/api/stripeWebhook', express.raw({ type: 'application/json', limit: MAX_STRIPE_WEBHOOK_BYTES }), stripeWebhookHandler)
  app.post('/api/uploadParticle', express.raw({ type: 'image/*', limit: MAX_UPLOAD_BYTES }), uploadParticleHandler)

  app.use(express.urlencoded({ extended: true }))
  app.use(express.json())

  app.get('/api/me', meHandler)
  app.patch('/api/me', updateMeHandler)
  app.get('/api/billing', billingStatusHandler)
  app.post('/api/billing', billingActionHandler)
  app.get('/api/presets', presetsHandler)
  app.get('/api/preset', presetHandler)
  app.post('/api/savePreset', savePresetHandler)
  app.get('/api/getConfig/:name', getConfigHandler)
  app.get('/api/packs', packsHandler)
  app.get(['/api/packs/mine', '/api/myPacks'], myPacksHandler)
  app.post(['/api/pack', '/api/createPack'], createPackHandler)
  app.get('/api/ping', pingHandler)

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' })
  })
  app.use(handleErrors)
  return app
}
