// Seeds the global (unowned) presets into MongoDB.
//
//   pnpm seed                              seeds `default`, which is generated from configDefaults
//   pnpm seed --file presets.json          also seeds every preset in the file ({ name: { pack, sprite, config } })
//   pnpm seed --file presets.json fire ice limits the run to the named presets
//
// The file is not committed: `pnpm export-presets` writes one from the database (scripts/presets.local.json).
require('dotenv').config({ quiet: true })
require('@babel/register')({
  extensions: ['.ts'],
  presets: [
    ['@babel/preset-env', { targets: { node: 'current' } }],
    '@babel/preset-typescript',
  ],
})

const fs = require('fs')
const path = require('path')
const mongoose = require('mongoose')
const { requireEnv } = require('../server/env.ts')
const { configDefaults } = require('../src/config/configDefaults.ts')
const { toStoredConfig } = require('../src/config/storedConfig.ts')
const { Preset } = require('../server/models/Preset.ts')

const parseArgs = (args) => {
  const fileFlag = args.indexOf('--file')
  const file = fileFlag === -1 ? undefined : args[fileFlag + 1]
  if (fileFlag !== -1 && !file) throw new Error('--file needs a path')
  const names = args.filter((arg, i) => i !== fileFlag && i !== fileFlag + 1)
  return { file, names }
}

// The default preset is the default look, so it is built from configDefaults and never stored or edited as data.
const defaultPreset = () => ({
  pack: 'Essentials',
  sprite: configDefaults.particle.sprites.value[0],
  config: toStoredConfig(configDefaults),
})

const loadPresets = (file) => {
  const fromFile = file ? JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')) : {}
  return { ...fromFile, default: defaultPreset() }
}

const seed = async () => {
  const { file, names: only } = parseArgs(process.argv.slice(2))
  const presets = loadPresets(file)
  const unknown = only.filter(name => !(name in presets))
  if (unknown.length) throw new Error(`Unknown preset(s): ${unknown.join(', ')}`)

  await mongoose.connect(requireEnv.MONGO_URI())
  console.info('Connected to MongoDB')

  for (const [name, data] of Object.entries(presets)) {
    if (only.length && !only.includes(name)) continue
    // Target only global (unowned) rows so we never overwrite a user's preset with the same name.
    await Preset.findOneAndUpdate(
      { name, $or: [{ userId: { $exists: false } }, { userId: null }] },
      { name, pack: data.pack, sprite: data.sprite, config: data.config },
      { upsert: true, new: true, runValidators: true }
    )
    console.info(`Seeded: ${name}`)
  }

  await mongoose.disconnect()
  console.info('Done')
}

seed().catch(err => {
  console.error(err)
  process.exit(1)
})
