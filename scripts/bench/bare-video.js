// node bare-video.js <clip.mp4> [secs=60]   plays one clip alone in a plain tab of a Chromium started with --remote-debugging-port=9222 (the app tab is hidden behind it),
// looping, and reports its frame gaps and stalls. Tells the file and the browser's decoder apart from the app's own rendering.
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core')
const clip = process.argv[2]
const secs = Number(process.argv[3] || 60)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
;(async () => {
  const browser = await chromium.connectOverCDP(process.env.CDP_URL || 'http://localhost:9222')
  const context = browser.contexts()[0]
  const page = await context.newPage()
  await page.goto(`http://localhost:3001/${clip}`)
  await page.bringToFront()
  await page.evaluate(() => {
    const v = document.querySelector('video')
    v.loop = true
    v.muted = true
    window.__b = { gaps: [], waits: [], last: null, t0: performance.now(), loops: 0 }
    v.addEventListener('waiting', () => window.__b.waits.push([+(performance.now() - window.__b.t0).toFixed(0), +v.currentTime.toFixed(2), v.readyState]))
    v.addEventListener('seeked', () => { window.__b.loops++ })
    const cb = (now, m) => { const b = window.__b; if (b.last !== null && !v.paused) b.gaps.push([now - b.t0, now - b.last, +m.mediaTime.toFixed(3)]); b.last = v.paused ? null : now; v.requestVideoFrameCallback(cb) }
    v.requestVideoFrameCallback(cb)
    v.play()
  })
  await sleep(secs * 1000)
  const { gaps, waits } = await page.evaluate(() => window.__b)
  const g = gaps.map((x) => x[1]).filter((x) => x < 1000)
  const s = [...g].sort((a, b) => a - b)
  const p = (q) => s[Math.min(s.length - 1, Math.floor(s.length * q))]
  const big = gaps.filter((x) => x[1] > 60 && x[1] < 1000)
  console.log(`${clip}: ${g.length} frames in ${secs}s alone | gap p50 ${p(0.5).toFixed(1)} p95 ${p(0.95).toFixed(1)} max ${Math.max(...g).toFixed(0)} | gaps >60ms: ${big.length} | gaps >100ms: ${big.filter((x) => x[1] > 100).length} | waiting events: ${waits.length}`)
  if (big.length) console.log('  gaps >60ms at clip position (s):', big.slice(0, 20).map((x) => `${x[2].toFixed(1)}(${x[1].toFixed(0)}ms)`).join(' '))
  if (waits.length) console.log('  waiting at clip position (s):', waits.slice(0, 20).map((w) => w[1]).join(' '))
  await page.close()
  await browser.close()
})().catch((e) => { console.error('FAILED', e.message); process.exit(1) })
