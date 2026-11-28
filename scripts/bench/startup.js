// Usage: node startup.js <label> [--runs=3] [--throttle] [--fullres] [--headless] [--size=1280x800] [--url=http://localhost:4100]
//
// Cold loads of a built copy of the app (serve it with serve.js, which gzips text as a CDN would), each in a fresh browser, and where the time goes
// between first paint and the first meaningful frame. Each run collects `window.perfProbe.startup()` (the page's own marks and spans, with ?perf=1),
// and adds what the page cannot see by itself:
//   - a Chrome trace of the main thread: script parse/compile and evaluation per file, and the rest of the busy time, split at the page's marks
//   - every WebGL shader compile and link, and the status queries that wait on them (three.js asks right after linking, so that is where
//     a compile shows as main-thread time), timestamped so they land in a phase
//   - texture uploads (texImage2D and friends), which is where the video's first frames and the sprites cost
// --throttle is Chrome's Fast 4G preset plus a 4x CPU slowdown. --fullres adds ?fullres=1 (the 4K galaxy clip).
// The first meaningful frame is the first frame drawn once the video layer has its first frame ('video-ready'): before it the backdrop is black.
// Results: <BENCH_DIR>/startup-<label>.json, and a table of medians on stdout.
const path = require('path')
const fs = require('fs')
const OUT = process.env.BENCH_DIR || path.join(__dirname, 'out')
fs.mkdirSync(OUT, { recursive: true })
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core')

const args = process.argv.slice(2)
const label = args[0]
if (!label || label.startsWith('--')) { console.log('usage: node startup.js <label> [--runs=3] [--throttle] [--fullres] [--headless]'); process.exit(1) }
const flag = (name, fallback) => (args.find((a) => a.startsWith(`--${name}=`)) || `--${name}=${fallback}`).split('=').slice(1).join('=')
const runs = Number(flag('runs', 3))
const throttle = args.includes('--throttle')
const fullres = args.includes('--fullres')
const headless = args.includes('--headless')
const size = flag('size', '1280x800')
const baseUrl = flag('url', process.env.BENCH_URL || 'http://localhost:4100')
const [width, height] = size.split('x').map(Number)
// --filmstrip: screenshots every 300 ms until the first meaningful frame (to see what shows when; the screenshots slow the page, so a
// filmstrip run is for looking at, not for its numbers).
const filmstrip = args.includes('--filmstrip')

// Chrome DevTools' Fast 4G preset.
const FAST_4G = { offline: false, latency: 165, downloadThroughput: (9 * 1000 * 1000 / 8) * 0.9, uploadThroughput: (1.5 * 1000 * 1000 / 8) * 0.9 }
const CPU_SLOWDOWN = 4
const TIMEOUT_MS = throttle ? 120000 : 40000

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const median = (values) => { const s = values.filter((v) => typeof v === 'number').sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null }
const r0 = (v) => (v == null ? null : Math.round(v))

// Page-side: time the GL calls that compile shaders or upload textures, and every display frame, from the very start of the page.
const INSTRUMENT = () => {
  const gl = { compile: [], upload: [] }
  window.__startupGl = gl
  const wrap = (proto, name, bucket) => {
    const original = proto[name]
    if (!original) return
    proto[name] = function (...callArgs) {
      const start = performance.now()
      try { return original.apply(this, callArgs) } finally {
        const ms = performance.now() - start
        if (ms > 0.05) gl[bucket].push({ at: start, ms, name })
      }
    }
  }
  ;[window.WebGL2RenderingContext, window.WebGLRenderingContext].filter(Boolean).forEach(({ prototype }) => {
    ;['compileShader', 'linkProgram', 'getProgramParameter', 'getShaderParameter', 'getProgramInfoLog', 'getShaderInfoLog', 'useProgram'].forEach((name) => wrap(prototype, name, 'compile'))
    ;['texImage2D', 'texSubImage2D', 'texImage3D', 'texStorage2D', 'generateMipmap'].forEach((name) => wrap(prototype, name, 'upload'))
  })
  const frames = []
  window.__startupFrames = frames
  const loop = (t) => { frames.push(t); requestAnimationFrame(loop) }
  requestAnimationFrame(loop)
  window.addEventListener('load', () => performance.mark('fx:window-load'))
}

// --cpu: a sampled CPU profile, its self time per source file in each phase, mapped through the bundle's source map when it has one
// (build with `pnpm exec webpack --mode production --devtool source-map`). Sampling adds a little overhead, so compare --cpu runs with --cpu runs.
const cpu = args.includes('--cpu')
let SourceMapConsumer = null
const consumers = new Map()
const consumerFor = (url) => {
  if (consumers.has(url)) return consumers.get(url)
  let consumer = null
  try {
    const file = path.join(__dirname, '../../public', `${new URL(url).pathname}.map`)
    if (fs.existsSync(file)) {
      SourceMapConsumer = SourceMapConsumer || require(path.join(__dirname, '../../node_modules/.pnpm/source-map-js@1.2.2/node_modules/source-map-js')).SourceMapConsumer
      consumer = new SourceMapConsumer(JSON.parse(fs.readFileSync(file, 'utf8')))
    }
  } catch { consumer = null }
  consumers.set(url, consumer)
  return consumer
}
// The module a profile node's code came from: node_modules package, or src/packages path, or the URL's file.
const sourceOf = ({ url, lineNumber, columnNumber }) => {
  if (!url) return '(native)'
  const consumer = consumerFor(url)
  const file = url.split('?')[0].split('/').pop()
  if (!consumer) return file
  const { source } = consumer.originalPositionFor({ line: lineNumber + 1, column: columnNumber })
  if (!source) return file
  const modules = /node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?((?:@[^/]+\/)?[^/]+)/.exec(source)
  if (modules) return modules[1]
  const local = /(src|packages)\/(.+)$/.exec(source)
  return local ? `${local[1]}/${local[2]}` : source
}
const summarizeProfile = (profile, alignAt, phases) => {
  const byId = new Map(profile.nodes.map((node) => [node.id, node]))
  // The first sample inside the alignment loop is at page time alignAt.
  let navMs = 0
  {
    let t = profile.startTime
    for (let k = 0; k < profile.samples.length; k++) {
      t += profile.timeDeltas[k]
      if (byId.get(profile.samples[k])?.callFrame.functionName === '__startupAlign') { navMs = t / 1000 - alignAt; break }
    }
  }
  const label = new Map()
  const keyOf = (node) => {
    if (label.has(node.id)) return label.get(node.id)
    const { functionName, url } = node.callFrame
    let key
    if (!url) key = functionName === '(garbage collector)' || functionName === '(program)' || functionName === '(idle)' ? functionName : `(native) ${functionName}`
    else key = sourceOf(node.callFrame)
    label.set(node.id, key)
    return key
  }
  const out = {}
  let t = profile.startTime
  profile.samples.forEach((id, k) => {
    t += profile.timeDeltas[k]
    const node = byId.get(id)
    if (!node) return
    const key = keyOf(node)
    if (key === '(idle)') return
    const at = t / 1000 - navMs
    const phase = (phases.find(({ end }) => at < end) || phases[phases.length - 1]).name
    const ms = (profile.timeDeltas[k + 1] ?? profile.timeDeltas[k]) / 1000
    out[phase] = out[phase] || {}
    out[phase][key] = (out[phase][key] || 0) + ms
  })
  return Object.fromEntries(Object.entries(out).map(([phase, keys]) => [phase,
    Object.fromEntries(Object.entries(keys).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([key, ms]) => [key, Math.round(ms)]))]))
}

const readTrace = async (session) => {
  const chunks = []
  const done = new Promise((resolve) => session.once('Tracing.tracingComplete', resolve))
  await session.send('Tracing.end')
  const { stream } = await done
  for (;;) {
    const { data, eof, base64Encoded } = await session.send('IO.read', { handle: stream })
    chunks.push(base64Encoded ? Buffer.from(data, 'base64').toString() : data)
    if (eof) break
  }
  await session.send('IO.close', { handle: stream })
  const text = chunks.join('')
  const parsed = JSON.parse(text)
  return Array.isArray(parsed) ? parsed : parsed.traceEvents
}

// Main-thread time from the trace, in ms: script parse/compile and evaluation per file, GC, and all busy time, each split into the phases.
const findNav = (events) => events.find((e) => e.name === 'navigationStart' && e.args?.data?.isLoadingMainFrame && e.args.data.documentLoaderURL?.startsWith('http'))
  || events.find((e) => e.name === 'navigationStart')
const summarizeTrace = (events, phases) => {
  const nav = findNav(events)
  if (!nav) return null
  const origin = nav.ts
  const renderer = events.find((e) => e.name === 'thread_name' && e.args?.name === 'CrRendererMain' && e.pid === nav.pid)
  const tid = renderer ? renderer.tid : nav.tid
  const main = events.filter((e) => e.pid === nav.pid && e.tid === tid && e.ph === 'X' && typeof e.dur === 'number' && e.ts >= origin)
  const phaseOf = (msFromNav) => (phases.find(({ end }) => msFromNav < end) || phases[phases.length - 1]).name
  const out = {}
  const add = (phase, key, ms) => { out[phase] = out[phase] || {}; out[phase][key] = (out[phase][key] || 0) + ms }
  const fileOf = (e) => (e.args?.data?.url || e.args?.fileName || '').split('?')[0].split('/').pop() || 'inline'
  main.forEach((e) => {
    const at = (e.ts - origin) / 1000
    const ms = e.dur / 1000
    const phase = phaseOf(at)
    if (e.name === 'RunTask' || e.name === 'ThreadControllerImpl::RunTask') add(phase, 'busy', ms)
    else if (e.name === 'v8.compile' || e.name === 'v8.compileModule' || e.name === 'V8.CompileCode') add(phase, `compile ${fileOf(e)}`, ms)
    else if (e.name === 'EvaluateScript' || e.name === 'v8.evaluateModule') add(phase, `evaluate ${fileOf(e)}`, ms)
    else if (e.name === 'MajorGC' || e.name === 'MinorGC' || e.name === 'V8.GC_MARK_COMPACTOR' || e.name === 'V8.GCScavenger') add(phase, 'gc', ms)
    else if (e.name === 'ParseHTML') add(phase, 'html', ms)
    else if (e.name === 'Layout' || e.name === 'UpdateLayoutTree' || e.name === 'Paint') add(phase, 'style/layout', ms)
  })
  // Background script streaming (off the main thread, but it gates evaluation).
  const streaming = events.filter((e) => e.name === 'v8.parseOnBackground' && e.ph === 'X' && e.ts >= origin)
  const bg = streaming.reduce((sum, e) => sum + e.dur / 1000, 0)
  Object.values(out).forEach((phase) => Object.keys(phase).forEach((key) => { phase[key] = Math.round(phase[key]) }))
  return { byPhase: out, backgroundParseMs: Math.round(bg) }
}

const downloadsOf = (requests) => {
  const navTs = Math.min(...[...requests.values()].map((r) => r.start))
  return [...requests.values()].filter((r) => r.end).map((r) => ({
    file: r.url.split('?')[0].split('/').pop() || r.url,
    startMs: r0((r.start - navTs) * 1000),
    endMs: r0((r.end - navTs) * 1000),
    kb: r0(r.kb),
  })).sort((a, b) => a.endMs - b.endMs)
}

const runOnce = async (i) => {
  const wav = path.join(OUT, 'drums.wav')
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    headless,
    args: [
      '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
      ...(fs.existsSync(wav) ? [`--use-file-for-fake-audio-capture=${wav}`] : []),
      `--window-size=${width},${height}`,
      '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
      '--disable-features=CalculateNativeWinOcclusion', '--autoplay-policy=no-user-gesture-required',
    ],
  })
  try {
    const context = await browser.newContext({ viewport: headless ? { width, height } : null, permissions: ['microphone'] })
    const page = await context.newPage()
    page.on('pageerror', (error) => console.warn(`run ${i}: page error: ${error.message}`))
    page.on('console', (message) => { if (message.type() === 'error' && !/404|Not Found/.test(message.text())) console.warn(`run ${i}: console error: ${message.text().slice(0, 200)}`) })
    await page.addInitScript(INSTRUMENT)
    const session = await context.newCDPSession(page)
    await session.send('Network.enable')
    // A fresh browser per run is already a cold cache; turning the cache off on top would also refetch what the page itself reuses.
    if (throttle) {
      await session.send('Network.emulateNetworkConditions', FAST_4G)
      await session.send('Emulation.setCPUThrottlingRate', { rate: CPU_SLOWDOWN })
    }
    // Every request, with its encoded size (what came over the wire) and when it finished, in ms since navigation.
    const requests = new Map()
    session.on('Network.requestWillBeSent', ({ requestId, request, timestamp }) => requests.set(requestId, { url: request.url, start: timestamp }))
    session.on('Network.loadingFinished', ({ requestId, timestamp, encodedDataLength }) => {
      const entry = requests.get(requestId)
      if (entry) Object.assign(entry, { end: timestamp, kb: encodedDataLength / 1024 })
    })
    if (cpu) {
      await session.send('Profiler.enable')
      await session.send('Profiler.setSamplingInterval', { interval: 200 })
      await session.send('Profiler.start')
    }
    await session.send('Tracing.start', {
      transferMode: 'ReturnAsStream',
      traceConfig: { includedCategories: ['devtools.timeline', 'v8', 'v8.execute', 'disabled-by-default-devtools.timeline', 'blink.user_timing', 'loading', '__metadata'] },
    })
    const url = `${baseUrl}/?perf=1${fullres ? '&fullres=1' : ''}${flag('query', '') ? `&${flag('query', '')}` : ''}`
    const navWallMs = Date.now()
    await page.goto(url, { waitUntil: 'commit' })
    // The screencast hands over frames as the compositor draws them, with their time, without waiting on the page.
    if (filmstrip) {
      let last = -Infinity
      session.on('Page.screencastFrame', ({ data, sessionId, metadata }) => {
        void session.send('Page.screencastFrameAck', { sessionId }).catch(() => undefined)
        const at = Math.round(metadata.timestamp * 1000 - navWallMs)
        if (at - last < 250) return
        last = at
        fs.writeFileSync(path.join(OUT, `film-${label}-${String(Math.max(0, at)).padStart(5, '0')}.jpg`), Buffer.from(data, 'base64'))
      })
      await session.send('Page.enable')
      await session.send('Page.startScreencast', { format: 'jpeg', quality: 60, maxWidth: 640, maxHeight: 400, everyNthFrame: 1 })
    }
    // Wait for the video's first frame and the 45 frames that settle Auto, then for the first frames' watch to end.
    await page.waitForFunction(() => {
      const marks = window.perfProbe?.startup?.().marks
      return marks && marks.settled !== undefined && marks['video-ready'] !== undefined
    }, null, { timeout: TIMEOUT_MS, polling: 250 }).catch(() => console.warn(`run ${i}: timed out waiting for settled and video-ready`))
    await sleep(3000)
    const page_ = await page.evaluate(() => ({
      report: window.perfProbe.startup(),
      gl: window.__startupGl,
      frames: window.__startupFrames,
      timeOrigin: performance.timeOrigin,
    }))
    // A busy loop with a known name at a known performance.now(), so the profile's clock can be lined up with the page's marks.
    const alignAt = cpu ? await page.evaluate(() => {
      const start = performance.now()
      const __startupAlign = () => { const end = performance.now() + 30; while (performance.now() < end) { /* spin */ } }
      __startupAlign()
      return start
    }) : 0
    const profile = cpu ? (await session.send('Profiler.stop')).profile : null
    const trace = await readTrace(session)
    const { report, gl, frames } = page_
    const { marks } = report
    const firstPaint = marks['first-contentful-paint'] ?? marks['first-paint'] ?? null
    // The first rAF at or after video-ready: when the backdrop first shows.
    const videoReady = marks['video-ready'] ?? null
    // The page's own 'meaningful' mark (the reveal) when it has one, else the first display frame once the video and the first frame are both there.
    const meaningful = marks.meaningful ?? (videoReady == null ? null : (frames.find((t) => t >= Math.max(videoReady, marks['first-frame'] ?? 0)) ?? null))
    const appJs = downloadsOf(requests).find((d) => d.file === 'app.js')
    // The phases, in order; each ends at a mark (a missing mark leaves its phase empty).
    // Each phase runs up to a stage, in the order the stages were reached on this run (the build being measured may reorder them).
    const phases = [
      { name: 'to app.js downloaded', end: appJs?.endMs ?? 0 },
      { name: 'to main', end: marks.main ?? 0 },
      { name: 'to window-load', end: marks['window-load'] ?? 0 },
      { name: 'to audio-ready', end: marks['audio-ready'] ?? 0 },
      { name: 'to first-frame', end: marks['first-frame'] ?? 0 },
      { name: 'to meaningful', end: meaningful ?? 0 },
      { name: 'to settled', end: marks.settled ?? 0 },
    ].sort((a, b) => a.end - b.end).concat([{ name: 'after', end: Infinity }])
    const phaseOf = (at) => (phases.find(({ end }) => at < end) || phases[phases.length - 1]).name
    const sumBy = (list) => list.reduce((acc, { at, ms }) => { const p = phaseOf(at); acc[p] = Math.round(((acc[p] || 0) + ms) * 10) / 10; return acc }, {})
    const gaps = frames.slice(1).map((t, k) => ({ at: frames[k], gap: t - frames[k] })).filter(({ gap }) => gap > 50)
    const downloads = downloadsOf(requests)
    return {
      run: i,
      marks,
      spans: report.spans,
      meaningful: r0(meaningful),
      firstPaint,
      shaderMs: sumBy(gl.compile),
      shaderCalls: gl.compile.length,
      uploadMs: sumBy(gl.upload),
      longGaps: gaps.map(({ at, gap }) => ({ at: r0(at), gap: r0(gap), phase: phaseOf(at) })),
      frames: report.frames,
      downloads,
      trace: summarizeTrace(trace, phases),
      cpu: profile ? summarizeProfile(profile, alignAt, phases) : null,
    }
  } finally {
    await browser.close()
  }
}

const main = async () => {
  const results = []
  for (let i = 1; i <= runs; i++) {
    const result = await runOnce(i)
    results.push(result)
    console.log(`run ${i}: FCP ${result.marks['first-contentful-paint']}  first layer ${result.marks['first-layer']}  main ${result.marks.main}  first frame ${result.marks['first-frame']}  video ${result.marks['video-ready']}  meaningful ${result.meaningful}  settled ${result.marks.settled}  ui ${result.marks.ui}  audio ${result.marks['audio-ready']}  longest frame ${result.frames.longestMs}`)
  }
  const file = path.join(OUT, `startup-${label}.json`)
  fs.writeFileSync(file, JSON.stringify({ label, throttle, fullres, results }, null, 2))
  const m = (pick) => r0(median(results.map(pick)))
  const row = {
    'first content (FCP)': m((r) => r.marks['first-contentful-paint']),
    'first layer shown': m((r) => r.marks['first-layer']),
    'app.js done': m((r) => r.downloads.find((d) => d.file === 'app.js')?.endMs),
    main: m((r) => r.marks.main),
    presets: m((r) => r.marks.presets),
    'audio ready': m((r) => r.marks['audio-ready']),
    'pipeline span': m((r) => r.spans.pipeline),
    'warm-effects span': m((r) => r.spans['warm-effects']),
    'first frame': m((r) => r.marks['first-frame']),
    'video ready': m((r) => r.marks['video-ready']),
    meaningful: m((r) => r.meaningful),
    settled: m((r) => r.marks.settled),
    'ui mounted': m((r) => r.marks.ui),
    'longest frame (first 10 s)': m((r) => r.frames.longestMs),
  }
  console.log(`\n${label} (median of ${runs}, ms since navigation)`)
  console.table(row)
  console.log(`wrote ${file}`)
}

main().catch((error) => { console.error(error); process.exit(1) })
