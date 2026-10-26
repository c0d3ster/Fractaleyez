// node trace.js <label> [--popup] [--noshock] [--secs=10] [--quality=<tier>] [--gpu=nvidia] [--size=1280x800] [--pos=0,0]
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
  if (quality) await page.evaluate((q) => window.setQuality(q), quality)
  const early = args.includes('--early')
  if (early) await browser.startTracing(page, { categories: ['devtools.timeline', 'blink.animations', 'disabled-by-default-devtools.timeline', 'cc'], screenshots: false })
  if (noshock) await page.evaluate(() => window.updateConfigItem('effects', 'shockwave', false))
  if (popup) { const [p] = await Promise.all([ctx.waitForEvent('page'), page.keyboard.press('e')]); await p.waitForLoadState('load'); await sleep(2500) }
  await sleep(4000)
  if (!early) await browser.startTracing(page, { categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'v8', 'blink', 'cc', 'gpu', 'viz', 'disabled-by-default-v8.cpu_profiler', 'disabled-by-default-v8.cpu_profiler.hires'], screenshots: false })
  await sleep(secs * 1000)
  const buf = await browser.stopTracing()
  fs.writeFileSync(path.join(JOB, `trace-${label}.json`), buf)
  await browser.close()
  console.log('saved', buf.length)
})().catch((e) => { console.error('FAILED', e); process.exit(1) })
