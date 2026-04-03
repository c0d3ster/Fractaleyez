require('dotenv').config()
require('@babel/register')({
  extensions: ['.ts'],
  presets: [
    ['@babel/preset-env', { targets: { node: 'current' } }],
    '@babel/preset-typescript',
  ],
})

const mongoose = require('mongoose')
const { requireEnv } = require('../server/env.ts')
const { presets } = require('../src/config/presets.ts')
const { Preset } = require('../server/models/Preset.ts')

const seed = async () => {
  await mongoose.connect(requireEnv.MONGO_URI())
  console.info('Connected to MongoDB')

  for (const [name, data] of Object.entries(presets)) {
    const sprite = data.particle?.sprites?.value?.[0] ?? 'fractaleye.png'
    await Preset.findOneAndUpdate(
      { name },
      { name, pack: data.pack ?? '', sprite, config: data },
      { upsert: true, new: true }
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
