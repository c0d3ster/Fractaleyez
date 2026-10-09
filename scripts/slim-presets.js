// Rewrites stored preset configs from full items ({ name, type, defaultValue, value, min, max, step }) to bare values.
// The client loader accepts both shapes, so running this is optional; it only saves space.
//
//   node scripts/slim-presets.js           dry run (default): reports what would change
//   node scripts/slim-presets.js --apply   writes the slim configs
//
// Targets whichever database MONGO_URI points at (dev or prod), so check .env first.
require('dotenv').config({ quiet: true })
require('@babel/register')({
  extensions: ['.ts'],
  presets: [
    ['@babel/preset-env', { targets: { node: 'current' } }],
    '@babel/preset-typescript',
  ],
})

const mongoose = require('mongoose')
const { requireEnv } = require('../server/env.ts')
const { Preset } = require('../server/models/Preset.ts')

const isItem = (value) => value !== null && typeof value === 'object' && !Array.isArray(value) && 'value' in value

// Sections hold items keyed by name; video is already stored as { clips, index }.
const slimConfig = (config) => {
  const slim = {}
  for (const [section, items] of Object.entries(config)) {
    const isItemSection = section !== 'video' && items !== null && typeof items === 'object' && !Array.isArray(items)
    slim[section] = isItemSection
      ? Object.fromEntries(Object.entries(items).map(([key, item]) => [key, isItem(item) ? item.value : item]))
      : items
  }
  return slim
}

const run = async () => {
  const apply = process.argv.includes('--apply')
  await mongoose.connect(requireEnv.MONGO_URI())
  console.info(`Connected to ${mongoose.connection.name} (${apply ? 'APPLY' : 'dry run'})`)

  let changed = 0
  let bytesBefore = 0
  let bytesAfter = 0
  for await (const preset of Preset.find().lean()) {
    const slim = slimConfig(preset.config ?? {})
    const before = JSON.stringify(preset.config ?? {})
    const after = JSON.stringify(slim)
    if (before === after) continue
    changed += 1
    bytesBefore += before.length
    bytesAfter += after.length
    if (apply) await Preset.collection.updateOne({ _id: preset._id }, { $set: { config: slim } })
  }

  console.info(`${apply ? 'Updated' : 'Would update'} ${changed} presets: ${bytesBefore} -> ${bytesAfter} bytes of config`)
  await mongoose.disconnect()
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
