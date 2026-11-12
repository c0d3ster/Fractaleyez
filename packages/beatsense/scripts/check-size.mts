// Asserts the built bundle sizes (run after `pnpm build`) and that the section model is its own lazy chunk, not part of the main entry.
//
//   tsx scripts/check-size.mts
//
// Sizes are measured on the agent's machine from the first build with this check; they are a proposal to confirm in review.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dist = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'dist')
const KB = 1024
const sizeKb = (file: string): number => statSync(join(dist, file)).size / KB

/** The bytes (KB) each built file may take: the ESM entry without the model, the model chunk, the worklet. */
const BUDGETS_KB = { entry: 320, chunk: 360, worklet: 16 }

const chunks = readdirSync(dist).filter((name) => /^section-model-.*\.js$/.test(name))
const checks: { name: string; ok: boolean; detail: string }[] = []
const check = (name: string, ok: boolean, detail: string): void => void checks.push({ name, ok, detail })

check('section model is a separate chunk', chunks.length === 1, `${chunks.length} chunk(s): ${chunks.join(', ') || 'none'}`)
const entry = readFileSync(join(dist, 'index.js'), 'utf8')
check('entry loads the chunk with a dynamic import', /import\(["']\.\/section-model-[^"']+\.js["']\)/.test(entry), 'import("./section-model-*.js") in dist/index.js')
// The model is about 290 KB of JSON: with it inside, the entry would be at least that much bigger than the budget leaves room for.
const modelKb = statSync(join(dist, '..', 'src', 'sections', 'section-model.json')).size / KB
check('model weight is in the chunk, not the entry', chunks[0] !== undefined && sizeKb(chunks[0]) > modelKb * 0.9 && sizeKb('index.js') < BUDGETS_KB.entry, `model ${modelKb.toFixed(0)} KB`)
check(`dist/index.js under ${BUDGETS_KB.entry} KB`, sizeKb('index.js') < BUDGETS_KB.entry, `${sizeKb('index.js').toFixed(1)} KB`)
if (chunks[0]) check(`${chunks[0]} under ${BUDGETS_KB.chunk} KB`, sizeKb(chunks[0]) < BUDGETS_KB.chunk, `${sizeKb(chunks[0]).toFixed(1)} KB`)
check(`dist/worklet.js under ${BUDGETS_KB.worklet} KB`, sizeKb('worklet.js') < BUDGETS_KB.worklet, `${sizeKb('worklet.js').toFixed(1)} KB`)

checks.forEach(({ name, ok, detail }) => console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} (${detail})`))
if (checks.some(({ ok }) => !ok)) process.exitCode = 1
