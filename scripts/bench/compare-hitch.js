// Usage: node compare-hitch.js <basePrefix> <newPrefix> [--scenarios=a,b] [--sections]
// Reads every $BENCH_DIR/hitch-<prefix>-r*.json (hitch.js output, one file per run) and prints the median of each metric across a side's runs,
// base against new, with the change. Lower is better for every row. Medians, not means: one run with a stray stall should not move a row.
// ab.sh runs the two sides interleaved and calls this at the end.
const fs = require('fs')
const path = require('path')
const OUT = process.env.BENCH_DIR || path.join(__dirname, 'out')
const [basePrefix, newPrefix] = process.argv.slice(2)
const flag = (name) => (process.argv.find((a) => a.startsWith(`--${name}=`)) || '').split('=')[1]
const only = flag('scenarios') ? flag('scenarios').split(',') : null
const withSections = process.argv.includes('--sections')

const load = (prefix) => fs.readdirSync(OUT).filter((f) => f.startsWith(`hitch-${prefix}-r`) && f.endsWith('.json')).flatMap((f) => JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8')))
const median = (values) => { const s = values.filter((v) => typeof v === 'number').sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null }
const r1 = (v) => (v === null ? null : Math.round(v * 10) / 10)

const METRICS = [
  ['cpu ms/frame p50', (r) => r.cpuP50], ['cpu ms/frame p95', (r) => r.cpuP95], ['cpu worst frame', (r) => r.cpuMax],
  ['gpu ms/frame p50', (r) => r.gpuFrameP50], ['gpu ms/frame p95', (r) => r.gpuFrameP95],
  ['display gap p99', (r) => r.gapP99], ['display gap max', (r) => r.gapMax], ['gaps over 25 ms', (r) => r.over25], ['gaps over 50 ms', (r) => r.over50],
  ['page long frames', (r) => r.loaf && r.loaf.page && r.loaf.page.count], ['popup long frames', (r) => r.loaf && r.loaf.popup && r.loaf.popup.count],
  ['popup commits', (r) => r.popupCommits], ['geometries', (r) => r.gauges && r.gauges['three.geometries']],
]

const base = load(basePrefix)
const next = load(newPrefix)
if (!base.length || !next.length) { console.log(`no results for ${!base.length ? basePrefix : newPrefix} in ${OUT}`); process.exit(1) }
const runs = (rows) => new Set(rows.map((r) => r.scenario)).size
const perScenario = Math.round(base.length / runs(base))
console.log(`Base: ${base.length} scenario runs, new: ${next.length} (${runs(base)} scenarios, ${perScenario} run(s) each). Medians across runs; lower is better.`)
if (perScenario < 3) console.log('With fewer than 3 runs a change under about 15% is within the noise between runs (unchanged layers move 5 to 10% on their own). Compare the large rows.')
console.log('')

const change = (a, b) => (a === null || b === null ? '' : a === 0 ? (b === 0 ? '0%' : 'new') : `${b - a >= 0 ? '+' : ''}${Math.round(((b - a) / a) * 100)}%`)
const scenarios = [...new Set(base.map((r) => r.scenario))].filter((s) => !only || only.includes(s))
for (const scenario of scenarios) {
  const a = base.filter((r) => r.scenario === scenario)
  const b = next.filter((r) => r.scenario === scenario)
  if (!b.length) continue
  console.log(`${scenario}  (${a.length} base run(s), ${b.length} new)`)
  for (const [name, read] of METRICS) {
    const x = r1(median(a.map(read)))
    const y = r1(median(b.map(read)))
    if (x === null && y === null) continue
    console.log(`  ${name.padEnd(20)} ${String(x).padStart(9)} ${String(y).padStart(9)}   ${change(x, y)}`)
  }
  if (withSections) {
    const keys = [...new Set([...a, ...b].flatMap((r) => Object.keys(r.sections || {})))]
    for (const key of keys) for (const kind of ['cpuP50', 'gpuP50']) {
      const x = r1(median(a.map((r) => r.sections && r.sections[key] && r.sections[key][kind])))
      const y = r1(median(b.map((r) => r.sections && r.sections[key] && r.sections[key][kind])))
      if (x === null && y === null) continue
      console.log(`  ${`${key} ${kind.slice(0, 3)} p50`.padEnd(28)} ${String(x).padStart(1)} ${String(y).padStart(9)}   ${change(x, y)}`)
    }
  }
  console.log('')
}
