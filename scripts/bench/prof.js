const fs = require('fs'), path = require('path')
const f = process.argv[2], secs = Number(process.argv[3] || 10), topN = Number(process.argv[4] || 30)
const t = JSON.parse(fs.readFileSync(path.join((process.env.BENCH_DIR || path.join(__dirname, 'out')), `trace-${f}.json`)))
const ev = t.traceEvents || t
const nm = {}
ev.forEach((e) => { if (e.ph === 'M' && e.name === 'thread_name') nm[`${e.pid}:${e.tid}`] = e.args.name })
const nodes = new Map(); const self = {}; let total = 0
const byProfile = {}
ev.filter((e) => e.name === 'ProfileChunk').forEach((e) => {
  const id = e.id || e.id2?.local
  const p = (byProfile[id] ||= { nodes: new Map(), samples: [], deltas: [] })
  const cp = e.args.data.cpuProfile
  ;(cp.nodes || []).forEach((n) => p.nodes.set(n.id, n))
  p.samples.push(...(cp.samples || [])); p.deltas.push(...(e.args.data.timeDeltas || []))
})
Object.values(byProfile).forEach((p) => {
  p.samples.forEach((sid, i) => {
    const n = p.nodes.get(sid); if (!n) return
    const cf = n.callFrame; const d = p.deltas[i] || 0
    if (['(idle)', '(root)', '(program)'].includes(cf.functionName)) return
    const key = `${cf.functionName || '(anon)'} ${(cf.url || '').split('/').pop().split('?')[0]}:${cf.lineNumber + 1}`
    self[key] = (self[key] || 0) + d; total += d
  })
})
console.log('sampled ms/s total', (total / 1000 / secs).toFixed(0))
Object.entries(self).sort((a, b) => b[1] - a[1]).slice(0, topN).forEach(([k, v]) => console.log((v / 1000 / secs).toFixed(1).padStart(7), k))
