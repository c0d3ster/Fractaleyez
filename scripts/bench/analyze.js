const fs = require('fs'), path = require('path')
const f = process.argv[2]; const secs = Number(process.argv[3] || 10)
const t = JSON.parse(fs.readFileSync(path.join((process.env.BENCH_DIR || path.join(__dirname, 'out')), `trace-${f}.json`)))
const ev = t.traceEvents || t
const names = {}
ev.forEach((e) => { if (e.ph === 'M' && (e.name === 'thread_name' || e.name === 'process_name')) names[`${e.pid}:${e.tid}:${e.name}`] = e.args.name })
const threadName = (e) => names[`${e.pid}:${e.tid}:thread_name`]
const procName = (e) => names[`${e.pid}:0:process_name`] || names[`${e.pid}:${e.tid}:process_name`]
// busy per thread via RunTask-ish top-level events
const busy = {}
ev.filter((e) => e.ph === 'X' && e.name === 'ThreadControllerImpl::RunTask' || e.ph === 'X' && e.name === 'RunTask').forEach((e) => {
  const k = `${threadName(e) || e.tid}`; busy[k] = (busy[k] || 0) + e.dur / 1000
})
console.log('--- thread busy ms/s (RunTask)'); Object.entries(busy).sort((a, b) => b[1] - a[1]).slice(0, 8).forEach(([k, v]) => console.log(k.padEnd(30), (v / secs).toFixed(0)))
const main = ev.filter((e) => e.ph === 'X' && threadName(e) === 'CrRendererMain')
const agg = {}
main.forEach((e) => { const a = (agg[e.name] ||= { n: 0, ms: 0, max: 0 }); a.n++; a.ms += e.dur / 1000; a.max = Math.max(a.max, e.dur / 1000) })
console.log('--- renderer main events (ms/s, count, max ms); nested events overlap')
Object.entries(agg).sort((a, b) => b[1].ms - a[1].ms).slice(0, 28).forEach(([k, v]) => console.log(k.padEnd(40), (v.ms / secs).toFixed(1).padStart(8), String(v.n).padStart(7), v.max.toFixed(1).padStart(8)))
const fn = {}
main.filter((e) => e.name === 'FunctionCall' || e.name === 'TimerFire' || e.name === 'FireAnimationFrame').forEach((e) => {
  const d = (e.args && e.args.data) || {}
  const k = `${e.name} ${d.functionName || ''} ${(d.url || '').split('/').pop()}:${d.lineNumber || ''}`
  const a = (fn[k] ||= { n: 0, ms: 0, max: 0 }); a.n++; a.ms += e.dur / 1000; a.max = Math.max(a.max, e.dur / 1000)
})
console.log('--- JS entry points (ms/s, count, max)')
Object.entries(fn).sort((a, b) => b[1].ms - a[1].ms).slice(0, 12).forEach(([k, v]) => console.log(k.slice(0, 60).padEnd(62), (v.ms / secs).toFixed(1).padStart(8), String(v.n).padStart(6), v.max.toFixed(1).padStart(7)))
const gc = main.filter((e) => /GC/.test(e.name))
console.log('--- GC events on main:', gc.length, 'total ms', gc.reduce((s, e) => s + e.dur / 1000, 0).toFixed(1), 'max', Math.max(0, ...gc.map((e) => e.dur / 1000)).toFixed(1))
