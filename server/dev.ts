import path from 'path'
import express from 'express'
import { connectDB } from './db'
import { Preset } from './models/Preset'
import { verifyAuth } from './auth'

const BUILD_DIR = path.join(__dirname, '../public/')

const app = express()

app.use(express.static(BUILD_DIR))
app.use(express.urlencoded({ extended: true }))
app.use(express.json())

app.get('/api/getPresets', async (_req, res) => {
  const presets = await Preset.find({}, 'name pack sprite userId')
  res.send(presets)
})

app.get('/api/getConfigDefaults', async (_req, res) => {
  const preset = await Preset.findOne({ name: 'default' })
  if (!preset) return res.status(404).send('default preset not found')
  res.send(preset.config)
})

app.get('/api/getConfig/:name', async (req, res) => {
  const preset = await Preset.findOne({ name: req.params.name })
  if (!preset) return res.status(404).send(`${req.params.name} preset could not be found`)
  res.send(preset.config)
})

app.post('/api/savePreset', async (req, res) => {
  console.log('POST /api/savePreset', { name: req.body?.name, hasAuth: !!req.headers.authorization })
  let userId: string
  try {
    userId = await verifyAuth(req.headers.authorization)
    console.log('auth ok, userId:', userId)
  } catch (err) {
    console.error('auth failed:', err)
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { name, pack, config, force } = req.body
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'name is required' })
  }

  const trimmedName = name.trim()

  if (!force) {
    const existing = await Preset.findOne({ name: trimmedName, userId })
    if (existing) {
      return res.status(409).json({ error: 'Preset already exists', name: trimmedName })
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sprite = (config as any)?.particle?.sprites?.value?.[0] ?? 'fractaleye.png'
  const preset = await Preset.findOneAndUpdate(
    { name: trimmedName, userId },
    { name: trimmedName, userId, pack: typeof pack === 'string' ? pack.trim() : '', sprite, config },
    { upsert: true, new: true, runValidators: true }
  )
  res.status(200).json({ id: preset._id, name: preset.name })
})

connectDB()
  .then(() => app.listen(8080, () => console.info('Listening on port 8080!')))
  .catch(err => {
    console.error('Failed to connect to MongoDB:', err)
    process.exit(1)
  })
