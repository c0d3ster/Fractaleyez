// node gpubreakdown.js <label> [thread=CrGpuMain]   where a thread's time goes in a trace (made by trace.js or attach-trace.js): total ms per second,
// call count and longest call per event name, for events on that thread in the GPU process. Big traces are streamed.
const fs = require('fs')
const path = require('path')
const label = process.argv[2]
const wanted = process.argv[3] || 'CrGpuMain'
const file = path.join(process.env.BENCH_DIR || path.join(__dirname, 'out'), `trace-${label}.json`)
const names = {}
const slices = []
const take = (line) => {
  const text = line.endsWith(',') ? line.slice(0, -1) : line
  if (!text.startsWith('{') || !text.endsWith('}')) return
  let e
  try { e = JSON.parse(text) } catch { return }
  if (e.ph === 'M') { if (e.name === 'thread_name') names[`${e.pid}:${e.tid}`] = e.args.name; if (e.name === 'process_name') names[e.pid] = e.args.name; return }
  if (e.ph === 'X' && e.dur > 0) slices.push([e.pid, e.tid, e.name, e.ts, e.dur])
}
const fd = fs.openSync(file, 'r')
const buf = Buffer.alloc(32 * 1024 * 1024)
let rest = ''
let pos = 0
for (;;) {
  const n = fs.readSync(fd, buf, 0, buf.length, pos)
  if (n === 0) break
  pos += n
  const lines = (rest + buf.toString('latin1', 0, n)).split('\n')
  rest = lines.pop() ?? ''
  lines.forEach(take)
}
take(rest)
let lo = Infinity
let hi = 0
slices.forEach(([, , , ts, dur]) => { lo = Math.min(lo, ts); hi = Math.max(hi, ts + dur) })
const secs = (hi - lo) / 1e6
const byName = {}
slices.filter(([pid, tid]) => names[`${pid}:${tid}`] === wanted && /GPU/i.test(names[pid] || '')).forEach(([, , name, , dur]) => {
  const a = (byName[name] ||= { n: 0, ms: 0, max: 0 })
  a.n++
  a.ms += dur / 1000
  a.max = Math.max(a.max, dur / 1000)
})
console.log(`${label}: ${wanted}, ${secs.toFixed(1)}s of trace (nested events overlap, so rows do not sum)`)
console.log('ms/s   calls   max ms   event')
Object.entries(byName).sort((a, b) => b[1].ms - a[1].ms).slice(0, 16).forEach(([k, v]) => {
  console.log((v.ms / secs).toFixed(0).padStart(5), String(v.n).padStart(7), v.max.toFixed(0).padStart(7), '  ', k.slice(0, 90))
})
