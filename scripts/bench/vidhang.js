// node vidhang.js <label> [windowMs=300]   reads trace-<label>.json from BENCH_DIR (made by trace.js) and lines up each video stall
// (the `vwait|...` and `vgap|...` user-timing marks) with what every thread was doing just before it.
const fs = require('fs')
const path = require('path')
const label = process.argv[2]
const windowMs = Number(process.argv[3] || 300)
// Small traces parse whole. A big one (the string limit is ~512 MB) is read in chunks, one event per line, keeping only the fields used here.
const file = path.join(process.env.BENCH_DIR || path.join(__dirname, 'out'), `trace-${label}.json`)
const loadEvents = () => {
  if (fs.statSync(file).size < 300 * 1024 * 1024) { const t = JSON.parse(fs.readFileSync(file)); return t.traceEvents || t }
  const kept = []
  const fd = fs.openSync(file, 'r')
  const buf = Buffer.alloc(32 * 1024 * 1024)
  let rest = ''
  let pos = 0
  const take = (line) => {
    const text = line.endsWith(',') ? line.slice(0, -1) : line
    if (!text.startsWith('{') || !text.endsWith('}')) return
    let e
    try { e = JSON.parse(text) } catch { return }
    kept.push({ ph: e.ph, name: e.name, pid: e.pid, tid: e.tid, ts: e.ts, dur: e.dur, args: e.ph === 'M' ? e.args : undefined })
  }
  for (;;) {
    const n = fs.readSync(fd, buf, 0, buf.length, pos)
    if (n === 0) break
    pos += n
    const lines = (rest + buf.toString('latin1', 0, n)).split('\n')
    rest = lines.pop() ?? ''
    lines.forEach(take)
  }
  take(rest)
  return kept
}
const events = loadEvents()
const threadNames = {}
const procNames = {}
events.forEach((e) => {
  if (e.ph !== 'M') return
  if (e.name === 'thread_name') threadNames[`${e.pid}:${e.tid}`] = e.args.name
  if (e.name === 'process_name') procNames[e.pid] = e.args.name
})
const who = (e) => `${procNames[e.pid] || e.pid}/${threadNames[`${e.pid}:${e.tid}`] || e.tid}`
const slices = events.filter((e) => e.ph === 'X' && typeof e.dur === 'number' && e.dur > 0)
const marks = events.filter((e) => /^v(wait|gap)\|/.test(e.name)).sort((a, b) => a.ts - b.ts)
// A mark can be recorded by more than one frame or thread; keep one per name and time.
const unique = marks.filter((m, i) => i === 0 || m.name !== marks[i - 1].name || m.ts - marks[i - 1].ts > 5000)
let traceStart = Infinity
let traceEnd = 0
events.forEach((e) => {
  if (typeof e.ts !== 'number' || e.ts <= 0) return
  if (e.ts < traceStart) traceStart = e.ts
  if (e.ts + (e.dur || 0) > traceEnd) traceEnd = e.ts + (e.dur || 0)
})
const traceSecs = (traceEnd - traceStart) / 1e6
console.log(`trace ${label}: ${traceSecs.toFixed(1)}s, ${unique.length} video marks (${unique.filter((m) => m.name.startsWith('vwait')).length} stalls, ${unique.filter((m) => m.name.startsWith('vgap')).length} gaps over 60ms)`)

const mediaLike = (e) => /media|video|decod|mf|dxva|d3d11va|vda/i.test(`${threadNames[`${e.pid}:${e.tid}`] || ''} ${e.name}`)
const interesting = (e) => e.dur >= 8000 && !/^(ThreadControllerImpl::RunTask|RunTask|ThreadPool_RunTask|TaskQueueManager::ProcessTaskFromWorkQueue|MessageLoop::RunTask)$/.test(e.name)
const freq = {}
const baselineFreq = {}
const slicesByThread = (lo, hi) => slices.filter((e) => e.ts < hi && e.ts + e.dur > lo)

unique.slice(0, 14).forEach((m) => {
  const lo = m.ts - windowMs * 1000
  const hi = m.ts
  const inWin = slicesByThread(lo, hi)
  const busy = {}
  inWin.filter((e) => /^(ThreadControllerImpl::RunTask|RunTask|ThreadPool_RunTask)$/.test(e.name)).forEach((e) => {
    const k = who(e)
    busy[k] = (busy[k] || 0) + (Math.min(e.ts + e.dur, hi) - Math.max(e.ts, lo)) / 1000
  })
  const top = Object.entries(busy).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k} ${v.toFixed(0)}ms`).join(' | ')
  const long = inWin.filter(interesting).sort((a, b) => b.dur - a.dur).slice(0, 5).map((e) => `${who(e).split('/').pop()}:${e.name} ${(e.dur / 1000).toFixed(0)}ms`).join(' | ')
  const media = inWin.filter((e) => mediaLike(e) && e.dur >= 2000).sort((a, b) => b.dur - a.dur).slice(0, 3).map((e) => `${who(e).split('/').pop()}:${e.name} ${(e.dur / 1000).toFixed(0)}ms`).join(' | ')
  console.log(`\n@${((m.ts - traceStart) / 1e6).toFixed(2)}s ${m.name}`)
  console.log('  busiest   :', top || '-')
  console.log('  long tasks:', long || '-')
  console.log('  media     :', media || '-')
})

// Which long events precede stalls more often than they happen overall: count each (thread, event) in the window before every mark,
// against the same count over the whole trace scaled to the same total window time.
unique.forEach((m) => {
  const seen = new Set()
  slicesByThread(m.ts - windowMs * 1000, m.ts).filter(interesting).forEach((e) => {
    const k = `${who(e)} :: ${e.name}`
    if (seen.has(k)) return
    seen.add(k)
    freq[k] = (freq[k] || 0) + 1
  })
})
slices.filter(interesting).forEach((e) => { const k = `${who(e)} :: ${e.name}`; baselineFreq[k] = (baselineFreq[k] || 0) + 1 })
const windows = unique.length
const traceWindows = (traceSecs * 1000) / windowMs
console.log(`\n--- long events (>=8ms) seen in the ${windowMs}ms before a stall: share of stalls that had one, against how often a random ${windowMs}ms window has one`)
Object.entries(freq).map(([k, n]) => {
  const expected = Math.min(1, (baselineFreq[k] || 0) / traceWindows)
  return [k, n / windows, expected, (n / windows) / Math.max(expected, 0.001)]
}).sort((a, b) => b[3] - a[3]).slice(0, 14).forEach(([k, share, expected, lift]) => {
  console.log(`${(share * 100).toFixed(0).padStart(4)}% of stalls vs ${(expected * 100).toFixed(0).padStart(3)}% baseline (x${lift.toFixed(1)})  ${k.slice(0, 110)}`)
})

// Overall load by thread, to see what is saturated regardless of stalls.
const totals = {}
slices.filter((e) => /^(ThreadControllerImpl::RunTask|RunTask|ThreadPool_RunTask)$/.test(e.name)).forEach((e) => { const k = who(e); totals[k] = (totals[k] || 0) + e.dur / 1000 })
console.log('\n--- thread busy, ms per second of trace')
Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 8).forEach(([k, v]) => console.log((v / traceSecs).toFixed(0).padStart(6), k))
const mediaThreads = [...new Set(Object.entries(threadNames).filter(([, n]) => /media|video|decod/i.test(n)).map(([k, n]) => `${procNames[k.split(':')[0]] || k.split(':')[0]}/${n}`))]
console.log('\nmedia/video/decoder threads present:', mediaThreads.join(', ') || 'none')
