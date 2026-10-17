// Usage: node bench.js <label> [--popup] [--noshock] [--secs=20]
const path = require('path')
const fs = require('fs')
// Paths come from the environment so this runs on any machine: PLAYWRIGHT_CORE (module to require, default 'playwright-core'),
// CHROME_PATH (a Chromium/Chrome executable), BENCH_DIR (where wavs, profiles and results go, default ./out).
const OUT = process.env.BENCH_DIR || path.join(__dirname, 'out')
fs.mkdirSync(OUT, { recursive: true })
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core')
const CHROME = process.env.CHROME_PATH
const BASE_URL = process.env.BENCH_URL || 'http://localhost:3000'

const JOB = OUT
const args = process.argv.slice(2)
const label = args[0]
const popup = args.includes('--popup')
const noshock = args.includes('--noshock')
const secs = Number((args.find((a) => a.startsWith('--secs=')) || '--secs=20').split('=')[1])
const throttle = Number((args.find((a) => a.startsWith('--throttle=')) || '--throttle=1').split('=')[1])
const slowRaf = args.includes('--poprafslow')
const size = (args.find((a) => a.startsWith('--size=')) || '--size=1280x800').split('=')[1]
const uncapped = args.includes('--uncapped')
const gpuFlag = (args.find((a) => a.startsWith('--gpu=')) || '--gpu=default').split('=')[1]
const pos = (args.find((a) => a.startsWith('--pos=')) || '--pos=0,0').split('=')[1]
const offList = ((args.find((a) => a.startsWith('--off=')) || '--off=').split('=')[1] || '').split(',').filter(Boolean)
const warm = 5000

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// GPU engine utilization of the browser's processes over the measured window (Windows only), per adapter.
const sampleGpu = (seconds) => new Promise((resolve) => {
  if (process.platform !== 'win32') return resolve(null)
  require('child_process').execFile('powershell', ['-NoProfile', '-File', path.join(__dirname, 'gpu-util.ps1'), '-Seconds', String(seconds), '-ExePath', path.resolve(CHROME)], (err, stdout) => {
    try { resolve(JSON.parse(stdout)) } catch (e) { resolve(null) }
  })
})

const RECORDER = `(() => {
  const rec = { frames: [], beats: [], long: [], loaf: [] }
  window.__rec = rec
  let last = performance.now(), lastBeat = null
  const tick = (now) => {
    rec.frames.push([now, now - last])
    last = now
    const b = window.getLastBeatTime && window.getLastBeatTime()
    if (b != null && b !== lastBeat) { lastBeat = b; rec.beats.push(b) }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
  try { new PerformanceObserver((l) => l.getEntries().forEach((e) => rec.long.push([e.startTime, e.duration]))).observe({ type: 'longtask', buffered: false }) } catch (e) {}
  try { new PerformanceObserver((l) => l.getEntries().forEach((e) => rec.loaf.push([e.startTime, e.duration, e.blockingDuration]))).observe({ type: 'long-animation-frame', buffered: false }) } catch (e) {}
})()`

const metricsOf = async (page) => {
  const s = await page.context().newCDPSession(page)
  await s.send('Performance.enable')
  const get = async () => Object.fromEntries((await s.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]))
  return { get }
}

const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))] || 0 }

const run = async () => {
  const ctx = await chromium.launchPersistentContext(path.join(JOB, 'profile-' + label), {
    executablePath: CHROME,
    headless: false,
    viewport: null,
    args: [
      '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
      '--use-file-for-fake-audio-capture=' + path.join(JOB, 'drums.wav'),
      '--window-size=' + size.replace('x', ','), ...(gpuFlag === 'nvidia' ? ['--force_high_performance_gpu'] : []), ...(uncapped ? ['--disable-frame-rate-limit', '--disable-gpu-vsync'] : []), '--window-position=' + pos,
      '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
      '--disable-features=CalculateNativeWinOcclusion', '--autoplay-policy=no-user-gesture-required',
    ],
  })
  await ctx.addInitScript(() => { Object.defineProperty(Screen.prototype, 'isExtended', { get: () => false }) })
  if (slowRaf) await ctx.addInitScript(() => { if (window.opener) window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 50) })
  const page = ctx.pages()[0] || await ctx.newPage()
  page.on('pageerror', (e) => console.log('pageerror', e.message.slice(0, 200)))
  await page.goto(BASE_URL, { waitUntil: 'load' })
  await sleep(4000)
  await page.mouse.click(600, 400)
  const gpu = await page.evaluate(() => {
    const c = document.createElement('canvas'); const gl = c.getContext('webgl'); const e = gl && gl.getExtension('WEBGL_debug_renderer_info')
    return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'n/a'
  })
  console.log('GPU:', gpu)
  console.log('viewport', await page.evaluate(() => [innerWidth, innerHeight, devicePixelRatio]))

  if (noshock) await page.evaluate(() => window.updateConfigItem('effects', 'shockwave', false))
  else {
    const on = await page.evaluate(() => window.config.effects.shockwave.value)
    if (!on) await page.evaluate(() => window.updateConfigItem('effects', 'shockwave', true))
  }

  // --off=fractal,logo,kaleidoscope,glow,shockwave,video,orbit: switch layers and effects off to see what each costs.
  for (const name of offList) {
    await page.evaluate((n) => {
      if (['video', 'fractal', 'orbit', 'logo'].includes(n)) window.setLayerEnabled(n, false)
      else window.updateConfigItem('effects', n, false)
    }, name)
  }
  await sleep(1500)
  let pop = null
  if (popup) {
    const [p] = await Promise.all([ctx.waitForEvent('page', { timeout: 10000 }), page.keyboard.press('e')])
    pop = p
    await pop.waitForLoadState('load')
    await sleep(2500)
    console.log('popup open', await pop.evaluate(() => [innerWidth, innerHeight, document.querySelectorAll('*').length]))
    await pop.evaluate(RECORDER)
  }
  await page.evaluate(RECORDER)
  await sleep(warm)
  // reset recorders after warm up
  await page.evaluate(() => { const r = window.__rec; r.frames.length = 0; r.beats.length = 0; r.long.length = 0; r.loaf.length = 0 })
  if (pop) await pop.evaluate(() => { const r = window.__rec; r.frames.length = 0; r.long.length = 0; r.loaf.length = 0 })

  if (throttle > 1) { const cs = await ctx.newCDPSession(page); await cs.send('Emulation.setCPUThrottlingRate', { rate: throttle }) }
  const mm = await metricsOf(page)
  const pm = pop ? await metricsOf(pop) : null
  const m0 = await mm.get(); const p0 = pm ? await pm.get() : null
  const gpuPromise = sampleGpu(secs)
  await sleep(secs * 1000)
  const gpuUtil = await gpuPromise
  const m1 = await mm.get(); const p1 = pm ? await pm.get() : null

  const rec = await page.evaluate(() => window.__rec)
  const prec = pop ? await pop.evaluate(() => window.__rec) : null
  const dts = rec.frames.map((f) => f[1])
  const beatsT = rec.beats
  const nearBeat = rec.frames.filter(([t]) => beatsT.some((b) => t >= b && t - b <= 200)).map((f) => f[1])
  const offBeat = rec.frames.filter(([t]) => !beatsT.some((b) => t >= b && t - b <= 200)).map((f) => f[1])
  const delta = (a, b, k) => ((b[k] - a[k]) * 1000) / secs // ms per second
  const out = {
    label, popup, noshock, throttle, uncapped, secs, gpu, gpuUtil, off: offList, size, pos,
    frames: dts.length, fps: +(dts.length / (dts.reduce((a, b) => a + b, 0) / 1000)).toFixed(1), beats: beatsT.length,
    frameMs: { p50: +pct(dts, 0.5).toFixed(1), p95: +pct(dts, 0.95).toFixed(1), p99: +pct(dts, 0.99).toFixed(1), max: +Math.max(...dts).toFixed(1) },
    over25: dts.filter((d) => d > 25).length, over40: dts.filter((d) => d > 40).length,
    nearBeat: { n: nearBeat.length, p50: +pct(nearBeat, 0.5).toFixed(1), p95: +pct(nearBeat, 0.95).toFixed(1), max: +Math.max(0, ...nearBeat).toFixed(1), over25: nearBeat.filter((d) => d > 25).length },
    offBeat: { n: offBeat.length, p50: +pct(offBeat, 0.5).toFixed(1), p95: +pct(offBeat, 0.95).toFixed(1), max: +Math.max(0, ...offBeat).toFixed(1), over25: offBeat.filter((d) => d > 25).length },
    dropped: { near: nearBeat.filter((d) => d > 9).length, off: offBeat.filter((d) => d > 9).length, nearFrac: +(nearBeat.filter((d) => d > 9).length / Math.max(1, nearBeat.length)).toFixed(4), offFrac: +(offBeat.filter((d) => d > 9).length / Math.max(1, offBeat.length)).toFixed(4) },
    longTasksMain: rec.long.length, longTaskMsMain: +rec.long.reduce((s, l) => s + l[1], 0).toFixed(0), longestTaskMain: +Math.max(0, ...rec.long.map((l) => l[1])).toFixed(0),
    loafMain: rec.loaf.length, loafBlockMs: +rec.loaf.reduce((s, l) => s + l[2], 0).toFixed(0),
    mainMsPerSec: { task: +delta(m0, m1, 'TaskDuration').toFixed(1), script: +delta(m0, m1, 'ScriptDuration').toFixed(1), layout: +delta(m0, m1, 'LayoutDuration').toFixed(1), style: +delta(m0, m1, 'RecalcStyleDuration').toFixed(1) },
  }
  if (p0) {
    out.popupMsPerSec = { task: +delta(p0, p1, 'TaskDuration').toFixed(1), script: +delta(p0, p1, 'ScriptDuration').toFixed(1), layout: +delta(p0, p1, 'LayoutDuration').toFixed(1), style: +delta(p0, p1, 'RecalcStyleDuration').toFixed(1) }
    out.popupFrames = prec.frames.length
    out.popupLong = { n: prec.long.length, ms: +prec.long.reduce((s, l) => s + l[1], 0).toFixed(0), longest: +Math.max(0, ...prec.long.map((l) => l[1])).toFixed(0), loaf: prec.loaf.length }
  }
  console.log(JSON.stringify(out, null, 1))
  fs.writeFileSync(path.join(JOB, `result-${label}.json`), JSON.stringify(out, null, 1))
  await ctx.close()
}

run().catch((e) => { console.error('FAILED', e); process.exit(1) })
