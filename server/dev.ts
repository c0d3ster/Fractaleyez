import path from 'path'
import express from 'express'
import { connectDB } from './db'
import { Preset } from './models/Preset'

const BUILD_DIR = path.join(__dirname, '../public/')

const app = express()

app.use(express.static(BUILD_DIR))
app.use(express.urlencoded({ extended: true }))
app.use(express.json())

app.get('/api/getPresets', async (_req, res) => {
  const presets = await Preset.find({}, 'name pack sprite')
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

connectDB().then(() => {
  app.listen(8080, () => console.info('Listening on port 8080!'))
})
