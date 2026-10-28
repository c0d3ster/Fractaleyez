// node trace.js <label> [--popup] [--videofront] [--lean] [--noshock] [--secs=10] [--quality=<tier>] [--gpu=nvidia] [--size=1280x800] [--pos=0,0]
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
const label = args[0], popup = args.includes('--popup'), noshock = args.includes('--noshock')
const secs = Number((args.find((a) => a.startsWith('--secs=')) || '--secs=10').split('=')[1])
const opt = (name, fallback) => (args.find((a) => a.startsWith(`--${name}=`)) || `--${name}=${fallback}`).split('=')[1]
const quality = opt('quality', '') || null
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
;(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: false,
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--use-file-for-fake-audio-capture=' + path.join(JOB, 'drums.wav'),
      '--window-size=' + opt('size', '1280x800').replace('x', ','), '--window-position=' + opt('pos', '0,0'), ...(opt('gpu', 'default') === 'nvidia' ? ['--force_high_performance_gpu'] : []), '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
      '--disable-features=CalculateNativeWinOcclusion', '--autoplay-policy=no-user-gesture-required'],
  })
  const ctx = await browser.newContext({ viewport: null })
  await ctx.addInitScript(() => { Object.defineProperty(Screen.prototype, 'isExtended', { get: () => false }) })
  const page = await ctx.newPage()
  await page.goto(BASE_URL); await sleep(4000)
  await page.mouse.click(600, 400)
  console.log('GPU:', await page.evaluate(() => { const gl = document.createElement('canvas').getContext('webgl'); const e = gl && gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'n/a' }))
  if (quality) await page.evaluate((q) => window.setQuality(q), quality)
  // --videofront puts the video layer in front of the fractal (a reload resets the order to the default, video at the back).
  if (args.includes('--videofront')) await page.evaluate(() => { window.config = { ...window.config, layers: { ...window.config.layers, order: ['fractal', 'video', 'orbit', 'logo'] } } })
  const early = args.includes('--early')
  if (early) await browser.startTracing(page, { categories: ['devtools.timeline', 'blink.animations', 'disabled-by-default-devtools.timeline', 'cc'], screenshots: false })
  if (noshock) await page.evaluate(() => window.updateConfigItem('effects', 'shockwave', false))
  if (popup) { const [p] = await Promise.all([ctx.waitForEvent('page'), page.keyboard.press('e')]); await p.waitForLoadState('load'); await sleep(2500) }
  // User-timing marks for every video stall (waiting/stalled events) and every frame gap over 60ms, so a hang can be lined up with what each thread was doing.
  await page.evaluate(() => {
    const seen = new WeakSet()
    const nm = (v) => v.src.split('/').pop()
    const watch = () => document.querySelectorAll('video').forEach((v) => {
      if (seen.has(v)) return
      seen.add(v)
      ;['waiting', 'stalled'].forEach((e) => v.addEventListener(e, () => performance.mark('vwait|' + e + '|' + nm(v) + '|' + v.currentTime.toFixed(2) + '|rs' + v.readyState)))
      let last = null
      const cb = (now) => { if (last !== null && !v.paused && now - last > 60) performance.mark('vgap|' + (now - last).toFixed(0) + '|' + nm(v) + '|' + v.currentTime.toFixed(2)); last = v.paused ? null : now; if (v.isConnected) v.requestVideoFrameCallback(cb) }
      v.requestVideoFrameCallback(cb)
    })
    setInterval(watch, 100); watch()
  })
  await sleep(4000)
  // --lean records only task timing, GPU, compositor and media events plus the video stall marks: a small trace, enough to see which thread is busy at a stall.
  if (!early && args.includes('--lean')) await browser.startTracing(page, { categories: ['toplevel', 'blink.user_timing', 'media', 'gpu'], screenshots: false })
  else if (!early) await browser.startTracing(page, { categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'v8', 'blink', 'blink.user_timing', 'cc', 'gpu', 'viz', 'media', 'toplevel', 'disabled-by-default-v8.cpu_profiler'], screenshots: false })
  await sleep(secs * 1000)
  const buf = await browser.stopTracing()
  fs.writeFileSync(path.join(JOB, `trace-${label}.json`), buf)
  await browser.close()
  console.log('saved', buf.length)
})().catch((e) => { console.error('FAILED', e); process.exit(1) })
