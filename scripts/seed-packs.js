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
const { Pack } = require('../server/models/Pack.ts')

const OWNER_ID = 'user_3BrYZAMVr6xtgiLURb0XtsjBKQB'

const packs = [
  { name: 'Essentials', isPremium: false },
  { name: 'Sprites',    isPremium: false },
  { name: 'Elemental',  isPremium: false },
  { name: 'Shlump',     isPremium: false },
  { name: 'Emorfik',    isPremium: false },
  { name: 'Galaxy',     isPremium: true  },
  { name: 'Sacred',     isPremium: true  },
]

const toSlug = (name) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

const seed = async () => {
  await mongoose.connect(requireEnv.MONGO_URI())
  console.info('Connected to MongoDB')

  for (const { name, isPremium } of packs) {
    const slug = toSlug(name)
    await Pack.findOneAndUpdate(
      { slug },
      { name, slug, userId: OWNER_ID, isPremium },
      { upsert: true, returnDocument: 'after', runValidators: true }
    )
    console.info(`Seeded: ${name} (${isPremium ? 'premium' : 'free'})`)
  }

  await mongoose.disconnect()
  console.info('Done')
}

seed().catch(err => {
  console.error(err)
  process.exit(1)
})
