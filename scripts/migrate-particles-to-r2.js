// Uploads the built-in particle sprite PNGs referenced by src/config/presets.ts (plus
// BUILTIN_PARTICLE_SPRITES) from public/ up to R2, under the `builtins/` prefix.
// Idempotent: skips any key that's already present in the bucket.
require('dotenv').config()
require('@babel/register')({
  extensions: ['.ts'],
  presets: [
    ['@babel/preset-env', { targets: { node: 'current' } }],
    '@babel/preset-typescript',
  ],
})

const fs = require('fs')
const path = require('path')
const { storageService } = require('../server/services/StorageService.ts')
const { presets } = require('../src/config/presets.ts')
const { BUILTIN_PARTICLE_SPRITES } = require('../src/config/particle.config.ts')

const PUBLIC_DIR = path.join(__dirname, '../public')

// Bundled presets reference sprites by bare filename (e.g. 'galaxySprite.png') anywhere
// inside their config tree — walk every value to find them, rather than hardcoding a list.
const collectReferencedPngs = (value, out) => {
  if (typeof value === 'string') {
    if (/^[A-Za-z0-9_.-]+\.png$/.test(value)) out.add(value)
    return
  }
  if (Array.isArray(value)) {
    value.forEach((v) => collectReferencedPngs(v, out))
    return
  }
  if (value && typeof value === 'object') {
    Object.values(value).forEach((v) => collectReferencedPngs(v, out))
  }
}

const findBuiltinPngs = () => {
  const out = new Set(BUILTIN_PARTICLE_SPRITES)
  collectReferencedPngs(presets, out)
  return [...out].filter((name) => fs.existsSync(path.join(PUBLIC_DIR, name)))
}

const migrate = async () => {
  const filenames = findBuiltinPngs()
  console.info(`Found ${filenames.length} built-in particle sprites to migrate`)

  for (const filename of filenames) {
    const key = `builtins/${filename}`
    if (await storageService.objectExists(key)) {
      console.info(`Skipping (already in R2): ${filename}`)
      continue
    }
    const body = fs.readFileSync(path.join(PUBLIC_DIR, filename))
    const url = await storageService.putObject(key, body, 'image/png')
    console.info(`Uploaded: ${filename} -> ${url}`)
  }

  console.info('Done')
}

migrate().catch((err) => {
  console.error(err)
  process.exit(1)
})
