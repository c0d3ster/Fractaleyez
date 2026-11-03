// Seeds the pack documents, the @user presets, and every pack's membership (`Pack.presetIds`).
//
// Run `pnpm seed` BEFORE this script: membership is looked up by preset name, so presets that are not in the
// database yet are left out of their packs. Safe to re-run; each run re-syncs rather than duplicating.
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
const { Pack } = require('../server/models/Pack.ts')
const { Preset } = require('../server/models/Preset.ts')

const OWNER_ID = 'user_3BrYZAMVr6xtgiLURb0XtsjBKQB'

const packs = [
  { name: 'Essentials', isPremium: false },
  { name: 'Sprites',    isPremium: false },
  { name: 'Elemental',  isPremium: false },
  { name: 'Shlump',     isPremium: false },
  { name: 'Emorfik',    isPremium: false },
  { name: 'Galaxy',     isPremium: true  },
  { name: 'Sacred',     isPremium: true  },
  { name: '@user',      isPremium: true  },
]

const USER_REFERENCE = '@user'

// Each @user preset is a verbatim copy of a Shlump preset with the artist sprites swapped for the @user reference.
const userVariants = [
  { from: 'shlump',      name: '@user' },
  { from: 'shlumpSpin',  name: '@userSpin' },
  { from: 'shlumpSalad', name: '@userSalad' },
  { from: 'hyperShlump', name: 'Hyper@user' },
]

// A preset exists once; a pack that lists another pack's preset holds a reference to it.
const extraMembers = { Essentials: ['@userSpin'] }

const ARTIST_SPRITES = new Set(['shlump.png', 'shlumpSkull.png'])

const swapSprites = (value) => {
  if (typeof value === 'string') return ARTIST_SPRITES.has(value) ? USER_REFERENCE : value
  if (Array.isArray(value)) return [...new Set(value.map(swapSprites))]
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, swapSprites(v)]))
  return value
}

const globalOnly = { $or: [{ userId: { $exists: false } }, { userId: null }] }

const toSlug = (name) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

const seedUserPresets = async () => {
  for (const { from, name } of userVariants) {
    const source = await Preset.findOne({ name: from, ...globalOnly }).lean()
    if (!source) throw new Error(`Shlump preset "${from}" not found: run \`pnpm seed\` first`)
    await Preset.findOneAndUpdate(
      { name, ...globalOnly },
      { name, pack: USER_REFERENCE, sprite: USER_REFERENCE, config: swapSprites(source.config) },
      { upsert: true, returnDocument: 'after', runValidators: true }
    )
    console.info(`Seeded preset: ${name} (from ${from})`)
  }
}

// Replaces each pack's membership with the global presets whose legacy `pack` names it, plus its extra members.
const syncMembership = async () => {
  const globals = await Preset.find(globalOnly, '_id name pack').lean()
  for (const { name } of packs) {
    const extras = extraMembers[name] ?? []
    const presetIds = globals
      .filter(preset => preset.pack === name || extras.includes(preset.name))
      .map(preset => preset._id)
    await Pack.updateOne({ slug: toSlug(name) }, { $set: { presetIds } })
    console.info(`Membership: ${name} (${presetIds.length} presets)`)
  }
}

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

  await seedUserPresets()
  await syncMembership()

  await mongoose.disconnect()
  console.info('Done')
}

seed().catch(err => {
  console.error(err)
  process.exit(1)
})
