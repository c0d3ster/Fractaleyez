// Renames the logo's stored `tilt` switch to `lean` in every preset's config. The client loader still reads `tilt`, so
// running this is optional; it just retires the old name from the data.
//
//   node scripts/rename-logo-tilt-to-lean.js           dry run (default): reports what would change
//   node scripts/rename-logo-tilt-to-lean.js --apply   renames the key
//
// Also sets updatedAt: browsers cache each preset body against it, so a raw update that leaves it alone keeps serving
// the old copy. Targets whichever database MONGO_URI points at (dev or prod), so check .env first.
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

const run = async () => {
  const apply = process.argv.includes('--apply')
  await mongoose.connect(requireEnv.MONGO_URI())
  console.info(`Connected to ${mongoose.connection.name} (${apply ? 'APPLY' : 'dry run'})`)

  let changed = 0
  for await (const preset of Preset.find({ 'config.logo.tilt': { $exists: true } }).lean()) {
    changed += 1
    if (!apply) continue
    // A preset that somehow has both keeps its lean and just drops the old one.
    const update = preset.config.logo.lean === undefined
      ? { $rename: { 'config.logo.tilt': 'config.logo.lean' } }
      : { $unset: { 'config.logo.tilt': '' } }
    await Preset.collection.updateOne({ _id: preset._id }, { ...update, $set: { updatedAt: new Date() } })
  }

  console.info(`${apply ? 'Renamed' : 'Would rename'} tilt to lean in ${changed} presets`)
  await mongoose.disconnect()
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
