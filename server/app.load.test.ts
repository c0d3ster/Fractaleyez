import { execFileSync } from 'child_process'
import { rmSync } from 'fs'
import path from 'path'
import { describe, it, expect, afterAll } from 'vitest'

const ROOT = path.resolve(import.meta.dirname, '..')
// Inside the repo so the compiled files resolve packages from the repo's node_modules, as the deployed function does from its own.
const OUT_DIR = path.join(ROOT, 'node_modules/.cache/app-load-test')

// Compiles the API with api/tsconfig.json (the ES modules Vercel deploys) and imports the result in a plain Node process. Vitest
// and tsx are forgiving in ways Node is not: they find './db' without its '.js', and smooth over importing named exports from a
// CommonJS package. This catches those before they reach the one function that serves the whole API.
describe('api/index.ts as Node loads it', () => {
  afterAll(() => {
    rmSync(OUT_DIR, { recursive: true, force: true })
  })

  it('compiles and imports as plain ES modules', () => {
    rmSync(OUT_DIR, { recursive: true, force: true })
    execFileSync(process.execPath, [path.join(ROOT, 'node_modules/typescript/bin/tsc'), '-p', 'api/tsconfig.json', '--outDir', OUT_DIR, '--rootDir', ROOT, '--ignoreDeprecations', '6.0'], {
      cwd: ROOT,
      stdio: 'pipe',
    })
    const entry = path.join(OUT_DIR, 'api/index.js')
    const script = `const mod = await import(${JSON.stringify(entry)}); if (typeof mod.default !== 'function') throw new Error('api/index.ts must default-export the Express app'); console.log('loaded')`
    const output = execFileSync(process.execPath, ['--input-type=module', '--no-warnings', '-e', script], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    expect(output.trim()).toBe('loaded')
  }, 120_000)
})
