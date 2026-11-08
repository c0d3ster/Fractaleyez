// Usage: node scale-probe.js [scales=1,1.25,1.5,1.75,2] [reference factor=4] [out dir]
// How much does supersampling the fractal buy? Renders one fractal frame at each scale (the Ultra tier, fractal only, on the virtual clock of parity.js) and
// measures how far it is from a true reference: the same frame drawn with no supersampling on a page `factor` times as large in each direction,
// then averaged in factor x factor blocks, so every reference pixel is factor squared real samples (a GPU's own downscale of a big render is a 2x2 tap
// and aliases itself). Prints RMSE and mean error, and the share of pixels more than 16 levels off. Needs the app on localhost:3000.
// Scales that are whole numbers give the GPU's bilinear lookup an even 2x2 average, which is why 2 beats 1.75.
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core')
const fs = require('fs')
const { VIRTUAL_TIME } = require('./parity.js')
const W = 800, H = 500
const scales = (process.argv[2] || '1,1.25,1.5,1.75,2').split(',').map(Number)
const REF = Number(process.argv[3] || 4)
const OUT = process.argv[4] || '/tmp/scale-out'
fs.mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const render = async (browser, scale, timed, factor = 1) => {
  const page = await (await browser.newContext({ viewport: { width: W * factor, height: H * factor } })).newPage()
  await page.addInitScript(VIRTUAL_TIME)
  await page.goto(`${process.env.BENCH_URL || 'http://localhost:3000'}/?perf=1`, { waitUntil: 'load' })
  await page.waitForFunction(() => typeof window.getPerfData === 'function', null, { timeout: 60000 })
  await sleep(4000)
  await page.evaluate(() => {
    ;['video', 'orbit', 'logo'].forEach((k) => window.setLayerEnabled(k, false))
    window.updateConfigItem('effects', 'glow', false); window.updateConfigItem('effects', 'kaleidoscope', false); window.updateConfigItem('effects', 'shockwave', false)
    window.setQuality('ultra')
  })
  await page.evaluate((s) => { const p = window.getQuality().profile; p.fractalScale = s; window.setQuality('quality'); window.setQuality('ultra') }, scale)
  await page.evaluate(() => window.__step(40))
  // Every run draws the same 48 frames, so the fractal is at the same point of its animation; the last 8 plus the readback are timed (wall clock).
  const t0 = Date.now()
  await page.evaluate(() => window.__step(8))
  const px = await page.evaluate((f) => {
    window.__step(1)
    if (f === 1) return window.__pixels()
    const gl = [...document.querySelectorAll('canvas')].find((c) => c.style.position === 'fixed')
    const copy = document.createElement('canvas'); copy.width = gl.width; copy.height = gl.height
    const ctx = copy.getContext('2d'); ctx.drawImage(gl, 0, 0)
    const src = ctx.getImageData(0, 0, gl.width, gl.height).data
    const w = gl.width / f, h = gl.height / f
    const out = new Array(w * h * 4)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const sum = [0, 0, 0]
      for (let dy = 0; dy < f; dy++) for (let dx = 0; dx < f; dx++) { const i = ((y * f + dy) * gl.width + (x * f + dx)) * 4; sum[0] += src[i]; sum[1] += src[i + 1]; sum[2] += src[i + 2] }
      const o = (y * w + x) * 4
      out[o] = Math.round(sum[0] / (f * f)); out[o + 1] = Math.round(sum[1] / (f * f)); out[o + 2] = Math.round(sum[2] / (f * f)); out[o + 3] = 255
    }
    return { rgba: out, png: 'data:,' }
  }, factor)
  const cost = { wallMs: Date.now() - t0 }
  await page.context().close()
  return { rgba: Buffer.from(px.rgba), png: Buffer.from(px.png.split(',')[1], 'base64'), cost }
}

;(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
  // Ground truth: the page at REF times its size with no supersampling, averaged REF x REF blocks (REF squared real samples per pixel).
  const big = await render(browser, 1, true, REF)
  const ref = { rgba: big.rgba }
  const rows = []
  for (const s of scales) {
    const r = await render(browser, s, true)
    fs.writeFileSync(`${OUT}/s${s}.png`, r.png)
    let se = 0, abs = 0, over = 0, n = 0
    for (let i = 0; i < r.rgba.length; i += 4) {
      let worst = 0
      for (let c = 0; c < 3; c++) { const d = r.rgba[i + c] - ref.rgba[i + c]; se += d * d; abs += Math.abs(d); worst = Math.max(worst, Math.abs(d)) }
      if (worst > 16) over++
      n++
    }
    rows.push({ scale: s, pixelsVsOne: +(s * s).toFixed(2), rmse: +Math.sqrt(se / (n * 3)).toFixed(3), meanAbs: +(abs / (n * 3)).toFixed(3), pctOver16: +(100 * over / n).toFixed(2), wallMsFor9Frames: r.cost.wallMs })
    console.log(JSON.stringify(rows[rows.length - 1]))
  }
  await browser.close()
})().catch((e) => { console.error('FAILED', e); process.exit(1) })
