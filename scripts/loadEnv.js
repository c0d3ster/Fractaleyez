// Loads the env for a script. `import './loadEnv.js'` (before anything reads process.env) replaces dotenv's own call.
//
//   tsx scripts/seed-packs.js                   .env                       (dev)
//   tsx scripts/seed-packs.js  --env=production .env, then .env.production on top (prod)
//
// `.env.production` overrides `.env`, so it only needs the values that differ (MONGO_URI, SEED_OWNER_ID, ...).
// Both files are git-ignored. The flag is removed from process.argv so scripts with positional arguments are unaffected.
import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'

const root = path.resolve(import.meta.dirname, '..')
const FLAG = '--env='

const takeEnvName = () => {
  const index = process.argv.findIndex((arg) => arg.startsWith(FLAG))
  if (index === -1) return 'development'
  const [arg] = process.argv.splice(index, 1)
  return arg.slice(FLAG.length)
}

const dbNameOf = (uri) => {
  const match = /^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]*)/.exec(uri ?? '')
  return match ? match[1] : ''
}

const load = () => {
  const name = takeEnvName()
  if (name !== 'development' && name !== 'production') throw new Error(`Unknown ${FLAG}${name}: use development or production`)

  dotenv.config({ path: path.join(root, '.env'), quiet: true })
  if (name === 'production') {
    const file = path.join(root, '.env.production')
    if (!fs.existsSync(file)) throw new Error('--env=production needs .env.production (MONGO_URI for the prod database, SEED_OWNER_ID, ...)')
    dotenv.config({ path: file, override: true, quiet: true })
  }

  // The database name is the cheapest check that the mode and the URI agree, so a swapped file can't write to the wrong one.
  const db = dbNameOf(process.env.MONGO_URI)
  if (name === 'production' && db === 'dev') throw new Error('--env=production but MONGO_URI points at the dev database')
  if (name === 'development' && db === 'prod') throw new Error('MONGO_URI points at the prod database: run with --env=production, or fix .env')

  console.info(`Environment: ${name}${db ? ` (database: ${db})` : ''}`)
}

load()
