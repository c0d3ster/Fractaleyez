import path from 'path'
import express from 'express'
import { connectDB } from './db'
import { presetsHandler } from './routes/presetsHandler'
import { presetHandler } from './routes/presetHandler'
import { savePresetHandler } from './routes/savePresetHandler'
import { packsHandler } from './routes/packsHandler'
import { myPacksHandler } from './routes/myPacksHandler'
import { createPackHandler } from './routes/createPackHandler'
import { uploadParticleHandler, MAX_UPLOAD_BYTES } from './routes/uploadParticleHandler'
import { meHandler } from './routes/meHandler'
import { clerkWebhookHandler, MAX_WEBHOOK_BYTES } from './routes/clerkWebhookHandler'

const BUILD_DIR = path.join(__dirname, '../public/')

const app = express()
app.use(express.static(BUILD_DIR))

// Registered before the global json/urlencoded parsers below: svix needs the raw request
// body to verify the signature, so this route must get it as a Buffer, not pre-parsed JSON.
app.post('/api/clerkWebhook', express.raw({ type: 'application/json', limit: MAX_WEBHOOK_BYTES }), clerkWebhookHandler)

app.use(express.urlencoded({ extended: true }))
app.use(express.json())

app.get('/api/me', meHandler)
app.get('/api/presets', presetsHandler)
app.get('/api/preset', presetHandler)
app.post('/api/savePreset', savePresetHandler)
app.get('/api/packs', packsHandler)
app.get('/api/packs/mine', myPacksHandler)
app.post('/api/pack', createPackHandler)
app.post('/api/uploadParticle', express.raw({ type: 'image/*', limit: MAX_UPLOAD_BYTES }), uploadParticleHandler)

connectDB()
  .then(() => app.listen(8080, () => console.info('Listening on port 8080!')))
  .catch(err => {
    console.error('Failed to connect to MongoDB:', err)
    process.exit(1)
  })
