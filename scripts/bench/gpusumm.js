// Table of GPU utilization and frame pacing: node gpusumm.js <result-prefix> [...]
const fs = require('fs'), path = require('path')
const dir = process.env.BENCH_DIR || path.join(__dirname, 'out')
console.log('case'.padEnd(34) + 'fps   p50   p95   max   GPU 3D%  GPU ms/frame  videodecode%')
for (const prefix of process.argv.slice(2)) {
  fs.readdirSync(dir).filter((f) => f.startsWith(`result-${prefix}`) && f.endsWith('.json')).sort().forEach((f) => {
    const r = JSON.parse(fs.readFileSync(path.join(dir, f)))
    const adapters = Object.values(r.gpuUtil || {})
    const busiest = adapters.sort((a, b) => (b['3d'] || 0) - (a['3d'] || 0))[0] || {}
    console.log(f.replace(/^result-|\.json$/g, '').padEnd(34) + [r.fps.toFixed(0), r.frameMs.p50, r.frameMs.p95, r.frameMs.max].map((x) => String(x).padEnd(6)).join('') + String(busiest['3d'] ?? '-').padEnd(8) + (busiest['3d'] ? ((busiest['3d'] / 100) * (1000 / r.fps)).toFixed(2) : '-').padEnd(14) + String(busiest.videodecode ?? '-'))
  })
}
