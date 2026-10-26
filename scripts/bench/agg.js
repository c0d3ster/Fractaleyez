const fs = require('fs'), path = require('path')
const prefixes = process.argv.slice(2)
// The tier a run ended on ("auto/balanced"), from the transitions bench.js logged; blank for runs from before the quality setting.
const tierOf = (r) => { const t = (r.tiers || [])[(r.tiers || []).length - 1]; return t ? `${t.setting}/${t.tier}` : '' }
console.log('config'.padEnd(26) + 'runs  fps   p95   max   nearBeat p95  near>9ms%  off>9ms%   busy ms/s  vid p95 steady/xfade  vid>60ms  vid drop%  hitch/s  beats/s(exp)  beat jit p95 (median)  late>40  tier')
const vid = (rs) => {
  const vs = rs.map((r) => r.video).filter(Boolean)
  if (!vs.length || !vs.some((v) => v.total)) return ''.padEnd(40)
  const a = (fn) => vs.reduce((s, v) => s + fn(v), 0) / vs.length
  const drop = vs.reduce((s, v) => s + v.dropped, 0) / Math.max(1, vs.reduce((s, v) => s + v.total, 0)) * 100
  return `${a((v) => v.steady.p95).toFixed(1)}/${a((v) => v.crossfade.p95).toFixed(1)}`.padEnd(22) + a((v) => v.steady.over60 + v.crossfade.over60).toFixed(1).padEnd(10) + drop.toFixed(1).padEnd(11)
}
// Beat jitter is a median across runs: one run whose loop-phase fit lands on the wrong phase would otherwise skew the average.
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0 }
for (const p of prefixes) {
  const rs = fs.readdirSync((process.env.BENCH_DIR || path.join(__dirname, 'out'))).filter((f) => f.startsWith(`result-${p}-r`) && f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join((process.env.BENCH_DIR || path.join(__dirname, 'out')), f))))
  if (!rs.length) continue
  const avg = (fn) => (rs.reduce((s, r) => s + fn(r), 0) / rs.length)
  const mx = (fn) => Math.max(...rs.map(fn))
  console.log(p.padEnd(26) + String(rs.length).padEnd(6) + avg((r) => r.fps).toFixed(0).padEnd(6) + avg((r) => r.frameMs.p95).toFixed(1).padEnd(6) + mx((r) => r.frameMs.max).toFixed(0).padEnd(6) +
    avg((r) => r.nearBeat.p95).toFixed(1).padEnd(14) + (avg((r) => r.dropped.nearFrac) * 100).toFixed(1).padEnd(11) + (avg((r) => r.dropped.offFrac) * 100).toFixed(1).padEnd(11) + avg((r) => r.mainMsPerSec.task).toFixed(0).padEnd(11) + vid(rs) + avg((r) => (r.flow ? r.flow.hitchPerSec : 0)).toFixed(2).padEnd(9) + avg((r) => (r.sync ? r.sync.perSec : 0)).toFixed(1).padEnd(14) + median(rs.map((r) => (r.sync ? r.sync.jitterP95 : 0))).toFixed(1).padEnd(14) + avg((r) => (r.sync ? r.sync.late40 : 0)).toFixed(1).padEnd(9) + tierOf(rs[rs.length - 1]))
}
