import path from 'path'
import express from 'express'
import { connectDB } from './db'
import { presetsHandler } from './routes/presetsHandler'
import { presetHandler } from './routes/presetHandler'
import { savePresetHandler } from './routes/savePresetHandler'

const BUILD_DIR = path.join(__dirname, '../public/')

const app = express()
app.use(express.static(BUILD_DIR))
app.use(express.urlencoded({ extended: true }))
app.use(express.json())

app.get('/api/presets', presetsHandler)
app.get('/api/preset', presetHandler)
app.post('/api/savePreset', savePresetHandler)

connectDB()
  .then(() => app.listen(8080, () => console.info('Listening on port 8080!')))
  .catch(err => {
    console.error('Failed to connect to MongoDB:', err)
    process.exit(1)
  })
