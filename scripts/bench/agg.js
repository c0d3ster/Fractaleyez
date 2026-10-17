const fs = require('fs'), path = require('path')
const prefixes = process.argv.slice(2)
console.log('config'.padEnd(26) + 'runs  fps   p95   max   nearBeat p95  near>9ms%  off>9ms%   busy ms/s')
for (const p of prefixes) {
  const rs = fs.readdirSync((process.env.BENCH_DIR || path.join(__dirname, 'out'))).filter((f) => f.startsWith(`result-${p}-r`) && f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join((process.env.BENCH_DIR || path.join(__dirname, 'out')), f))))
  if (!rs.length) continue
  const avg = (fn) => (rs.reduce((s, r) => s + fn(r), 0) / rs.length)
  const mx = (fn) => Math.max(...rs.map(fn))
  console.log(p.padEnd(26) + String(rs.length).padEnd(6) + avg((r) => r.fps).toFixed(0).padEnd(6) + avg((r) => r.frameMs.p95).toFixed(1).padEnd(6) + mx((r) => r.frameMs.max).toFixed(0).padEnd(6) +
    avg((r) => r.nearBeat.p95).toFixed(1).padEnd(14) + (avg((r) => r.dropped.nearFrac) * 100).toFixed(1).padEnd(11) + (avg((r) => r.dropped.offFrac) * 100).toFixed(1).padEnd(11) + avg((r) => r.mainMsPerSec.task).toFixed(0))
}
