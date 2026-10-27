// Usage: node bench.js <label> [--popup] [--noshock] [--secs=20] [--quality=auto|saver|balanced|quality|ultra] [--shot]
const path = require('path')
const fs = require('fs')
// Paths come from the environment so this runs on any machine: PLAYWRIGHT_CORE (module to require, default 'playwright-core'),
// CHROME_PATH (a Chromium/Chrome executable), BENCH_DIR (where wavs, profiles and results go, default ./out).
const OUT = process.env.BENCH_DIR || path.join(__dirname, 'out')
fs.mkdirSync(OUT, { recursive: true })
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core')
const CHROME = process.env.CHROME_PATH
const BASE_URL = process.env.BENCH_URL || 'http://localhost:3000'
// Extra Chromium flags, space separated (e.g. software GL on a machine without a GPU: "--use-angle=swiftshader --enable-unsafe-swiftshader").
const EXTRA_ARGS = (process.env.BENCH_CHROME_ARGS || '').split(' ').filter(Boolean)

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
const quality = (args.find((a) => a.startsWith('--quality=')) || '--quality=').split('=')[1] || null
const shot = args.includes('--shot')
// The popup normally gets a frame recorder, whose rAF loop makes it paint on every vsync; --norecpop leaves the popup alone, as a user's would be.
const recPopup = !args.includes('--norecpop')
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
  const rec = { frames: [], beats: [], long: [], loaf: [], tiers: [], vfc: [], vdrop: {}, preparedFrames: 0 }
  window.__rec = rec
  let last = performance.now(), lastBeat = null
  // Video cadence: every <video> gets a requestVideoFrameCallback loop that logs [time, mediaTime, playingVideoCount]; dropped frames are read per element.
  // Only playing elements count, so a clip that is loaded early and held paused (or retired but not yet removed) does not turn steady playback into "crossfade".
  const seen = new WeakSet()
  let vid = 0
  const watchVideos = () => {
    const vs = document.querySelectorAll('video')
    // Frames on which a clip sat paused with a frame ready: the next clip loaded early and waiting for the crossfade.
    if ([...vs].some((x) => x.paused && x.readyState >= 2 && !x.ended)) rec.preparedFrames++
    vs.forEach((v) => {
      const q = v.getVideoPlaybackQuality && v.getVideoPlaybackQuality()
      if (q) rec.vdrop[v.dataset.bid || (v.dataset.bid = String(++vid))] = [q.droppedVideoFrames, q.totalVideoFrames]
      if (seen.has(v)) return
      seen.add(v)
      const id = v.dataset.bid || (v.dataset.bid = String(++vid))
      const cb = (now, meta) => { rec.vfc.push([now, meta.mediaTime, [...document.querySelectorAll('video')].filter((x) => !x.paused).length, id, v.videoWidth, v.paused]); if (v.isConnected) v.requestVideoFrameCallback(cb) }
      v.requestVideoFrameCallback(cb)
    })
  }
  const tick = (now) => {
    rec.frames.push([now, now - last])
    last = now
    const b = window.getLastBeatTime && window.getLastBeatTime()
    if (b != null && b !== lastBeat) { lastBeat = b; rec.beats.push(b) }
    watchVideos()
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
  // The quality tier over time: one entry each time the setting or the tier it settled on changes (the main window only).
  let seenQuality = ''
  setInterval(() => {
    const q = window.getQuality && window.getQuality()
    const key = q ? q.setting + '/' + q.tier : ''
    if (key && key !== seenQuality) { seenQuality = key; rec.tiers.push([performance.now(), q.setting, q.tier]) }
  }, 250)
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
      '--disable-features=CalculateNativeWinOcclusion', '--autoplay-policy=no-user-gesture-required', ...EXTRA_ARGS,
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

  if (quality) await page.evaluate((q) => window.setQuality(q), quality)
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
    if (recPopup) await pop.evaluate(RECORDER)
  }
  await page.evaluate(RECORDER)
  await sleep(warm)
  // reset recorders after warm up
  await page.evaluate(() => { const r = window.__rec; r.frames.length = 0; r.beats.length = 0; r.long.length = 0; r.loaf.length = 0; r.vfc.length = 0; r.vdrop0 = JSON.parse(JSON.stringify(r.vdrop)) })
  if (pop && recPopup) await pop.evaluate(() => { const r = window.__rec; r.frames.length = 0; r.long.length = 0; r.loaf.length = 0 })

  if (throttle > 1) { const cs = await ctx.newCDPSession(page); await cs.send('Emulation.setCPUThrottlingRate', { rate: throttle }) }
  const mm = await metricsOf(page)
  const pm = pop ? await metricsOf(pop) : null
  const m0 = await mm.get(); const p0 = pm ? await pm.get() : null
  const gpuPromise = sampleGpu(secs)
  const t0 = await page.evaluate(() => performance.now())
  if (shot) { await sleep(Math.min(secs, 4) * 1000); await page.screenshot({ path: path.join(JOB, `shot-${label}.png`) }); await sleep(Math.max(0, secs - 4) * 1000) } else await sleep(secs * 1000)
  const gpuUtil = await gpuPromise
  const m1 = await mm.get(); const p1 = pm ? await pm.get() : null

  // Frames the app drew per second (its own rolling median); the recorder's `fps` counts display frames, which a frame-capped tier skips.
  const drawnFps = await page.evaluate(() => window.getPerfData().fps)
  const rec = await page.evaluate(() => window.__rec)
  const prec = pop && recPopup ? await pop.evaluate(() => window.__rec) : null
  const dts = rec.frames.map((f) => f[1])
  const beatsT = rec.beats
  const nearBeat = rec.frames.filter(([t]) => beatsT.some((b) => t >= b && t - b <= 200)).map((f) => f[1])
  const offBeat = rec.frames.filter(([t]) => !beatsT.some((b) => t >= b && t - b <= 200)).map((f) => f[1])
  const delta = (a, b, k) => ((b[k] - a[k]) * 1000) / secs // ms per second
  // Video cadence: gaps between consecutive presented frames of the same element, split into steady playback (one element) and crossfade (two).
  const vgaps = (pred) => {
    const g = []
    const last = {}
    // A frame shown while paused (a clip loaded early shows its first frame) starts no gap: the wait until it plays is not a stall.
    for (const [t, , n, id, , paused] of rec.vfc) { if (last[id] !== undefined && pred(n)) g.push(t - last[id]); last[id] = paused ? undefined : t }
    return g
  }
  const vstats = (g) => ({ n: g.length, p50: +pct(g, 0.5).toFixed(1), p95: +pct(g, 0.95).toFixed(1), max: +Math.max(0, ...g).toFixed(1), over60: g.filter((x) => x > 60).length, over100: g.filter((x) => x > 100).length })
  const drops = Object.entries(rec.vdrop).reduce((a, [id, [d, tot]]) => { const [d0, t0v] = (rec.vdrop0 || {})[id] || [0, 0]; return [a[0] + d - d0, a[1] + tot - t0v] }, [0, 0])
  // Beat sync: the drum loop is 16 s with a kick every 60/128 s (33 per loop, then a longer gap at the wrap), and the detector fires once per kick.
  // The loop's phase against the page clock is unknown (it depends on when capture started), so it is fitted by least squares; that also absorbs
  // the constant audio-capture latency, which cannot be measured without a loopback. What is left is timing jitter and misses.
  const LOOP = 16000, KICK = 60000 / 128, KICKS = 33
  const onsets = Array.from({ length: KICKS }, (_, k) => k * KICK)
  const nearest = (t, phi) => {
    const x = (((t - phi) % LOOP) + LOOP) % LOOP
    let best = Infinity
    for (const o of [...onsets, LOOP]) { const d = x - o; if (Math.abs(d) < Math.abs(best)) best = d }
    return best
  }
  let phi = 0
  if (beatsT.length) {
    let bestCost = Infinity
    for (let c = 0; c < LOOP; c += 5) { const cost = beatsT.reduce((a, t) => a + Math.min(nearest(t, c), 150) ** 2, 0); if (cost < bestCost) { bestCost = cost; phi = c } }
  }
  const resid = beatsT.map((t) => nearest(t, phi))
  const absr = resid.map(Math.abs)
  const hits = resid.filter((x) => Math.abs(x) <= 100).length
  const sync = {
    perSec: +(beatsT.length / secs).toFixed(2), expectedPerSec: +(KICKS / (LOOP / 1000)).toFixed(2),
    jitterP50: +pct(absr, 0.5).toFixed(1), jitterP95: +pct(absr, 0.95).toFixed(1), late40: absr.filter((x) => x > 40).length, n: beatsT.length, offGrid: beatsT.length - hits,
    lateMean: +(resid.reduce((a, b) => a + b, 0) / Math.max(1, resid.length)).toFixed(1),
  }
  const med = pct(dts, 0.5)
  const mean = dts.reduce((a, b) => a + b, 0) / Math.max(1, dts.length)
  const flow = { stdMs: +Math.sqrt(dts.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, dts.length)).toFixed(2), hitchPerSec: +(dts.filter((d) => d > med * 2.5).length / secs).toFixed(2) }
  const out = {
    sync, flow, beatTimes: beatsT.map((b) => +(b - t0).toFixed(1)),
    video: { preparedFrames: rec.preparedFrames, steady: vstats(vgaps((n) => n === 1)), crossfade: vstats(vgaps((n) => n > 1)), dropped: drops[0], total: drops[1], widths: [...new Set(rec.vfc.map((v) => v[4]))] },
    label, popup, noshock, throttle, uncapped, secs, quality, tiers: rec.tiers.map(([t, setting, tier]) => ({ atSec: +((t - t0) / 1000).toFixed(1), setting, tier })), gpu, gpuUtil, off: offList, size, pos,
    drawnFps, frames: dts.length, fps: +(dts.length / (dts.reduce((a, b) => a + b, 0) / 1000)).toFixed(1), beats: beatsT.length,
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
    if (prec) out.popupFrames = prec.frames.length
    if (prec) out.popupLong = { n: prec.long.length, ms: +prec.long.reduce((s, l) => s + l[1], 0).toFixed(0), longest: +Math.max(0, ...prec.long.map((l) => l[1])).toFixed(0), loaf: prec.loaf.length }
  }
  console.log(JSON.stringify(out, null, 1))
  fs.writeFileSync(path.join(JOB, `result-${label}.json`), JSON.stringify(out, null, 1))
  await ctx.close()
}

run().catch((e) => { console.error('FAILED', e); process.exit(1) })
