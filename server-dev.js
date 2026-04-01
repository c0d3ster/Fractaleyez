require('@babel/register')({
  extensions: ['.ts', '.tsx'],
  presets: [
    ['@babel/preset-env', { targets: { node: 'current' } }],
    '@babel/preset-typescript',
  ],
})

const path = require('path')
const express = require('express')
const bodyParser = require('body-parser')
const { presets } = require('./src/config/presets.ts')

const BUILD_DIR = path.join(__dirname, 'public/')

const app = express()

app.use(express.static(BUILD_DIR))
app.use(bodyParser.urlencoded({ extended: true }))
app.use(bodyParser.json())

app.get('/api/getConfigDefaults', (req, res) => res.send(presets.default))

app.get('/api/getConfig/:name', (req, res) => {
  const preset = presets[req.params.name]
  if (preset) {
    res.send(preset)
  } else {
    res.status(404).send(`${req.params.name} preset could not be found`)
  }
})

app.listen(8080, () => console.info('Listening on port 8080!'))
