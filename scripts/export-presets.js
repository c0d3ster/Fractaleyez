// Writes the global (unowned) presets from MongoDB to a JSON file in the shape `pnpm seed --file` reads:
// { name: { pack, sprite, config } }. Read-only against the database.
//
//   pnpm export-presets                 writes scripts/presets.local.json (git-ignored)
//   pnpm export-presets out/presets.json
import './loadEnv.js'

import fs from 'fs'
import path from 'path'
import mongoose from 'mongoose'
import { requireEnv } from '../server/env.ts'
import { Preset } from '../server/models/Preset.ts'

const DEFAULT_OUT = path.join(import.meta.dirname, 'presets.local.json')

const exportPresets = async () => {
  const out = path.resolve(process.argv[2] ?? DEFAULT_OUT)

  await mongoose.connect(requireEnv.MONGO_URI())
  console.info('Connected to MongoDB')

  const rows = await Preset.find({ $or: [{ userId: { $exists: false } }, { userId: null }] }).sort({ name: 1 }).lean()
  const presets = Object.fromEntries(rows.map(row => [row.name, { pack: row.pack ?? '', sprite: row.sprite, config: row.config }]))

  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, `${JSON.stringify(presets, null, 2)}\n`)
  console.info(`Wrote ${rows.length} presets to ${out}`)

  await mongoose.disconnect()
}

exportPresets().catch((err) => {
  console.error(err)
  process.exit(1)
})
