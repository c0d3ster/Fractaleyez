import { execFileSync } from 'child_process'
import path from 'path'
import { describe, it, expect } from 'vitest'

const ROOT = path.resolve(__dirname, '..')

// Loads api/index.ts the way Vercel runs it: each .ts file compiled to CommonJS on its own, and Node's require() of ES modules
// switched off, as Vercel's runtime loader refuses it. Locally Node 22+ quietly allows require() of an ES-module-only package,
// so without this an ESM-only dependency (svix 2.x did this) passes every other test and then crashes the one function
// that serves the whole API.
const LOADER = `
const fs = require('fs')
const ts = require('typescript')
require.extensions['.ts'] = (module, filename) => {
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  })
  module._compile(outputText, filename)
}
const mod = require('./api/index.ts')
if (typeof mod.default !== 'function') throw new Error('api/index.ts must default-export the Express app')
console.log('loaded')
`

describe('api/index.ts on a CommonJS-only runtime', () => {
  it('loads without requiring any ES-module-only package', () => {
    const output = execFileSync(process.execPath, ['--no-experimental-require-module', '--no-warnings', '-e', LOADER], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    expect(output.trim()).toBe('loaded')
  }, 60_000)
})
