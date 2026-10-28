// node draw-probe.js [secsPerTier=25] [tiers=saver,balanced,quality,ultra]   attaches to a Chromium started with --remote-debugging-port=9222 and measures what the
// viewer actually sees of the video: when each video frame is uploaded to the GPU texture (the moment it can appear), against when the decoder delivered it.
// Judder shows as frames held for different numbers of draws (a 24fps clip on a 30 or 60fps draw rate), skips as delivered frames that were never uploaded.
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core')
const secs = Number(process.argv[2] || 25)
const tiers = (process.argv[3] || 'saver,balanced,quality,ultra').split(',')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
;(async () => {
  const browser = await chromium.connectOverCDP(process.env.CDP_URL || 'http://localhost:9222')
  const page = browser.contexts().flatMap((c) => c.pages()).find((p) => p.url().startsWith('http://localhost:3000'))
  if (!page) throw new Error('no app page found')
  await page.evaluate(() => {
    if (window.__draw) return
    window.__draw = { up: [], del: [], on: false }
    const hook = (proto) => {
      const orig = proto.texImage2D
      proto.texImage2D = function (...args) {
        const src = args[args.length - 1]
        if (window.__draw.on && src instanceof HTMLVideoElement) window.__draw.up.push([performance.now(), src.src.split('/').pop()])
        return orig.apply(this, args)
      }
    }
    hook(WebGL2RenderingContext.prototype)
    hook(WebGLRenderingContext.prototype)
    const seen = new WeakSet()
    const watch = () => document.querySelectorAll('video').forEach((v) => {
      if (seen.has(v)) return
      seen.add(v)
      const src = v.src.split('/').pop()
      const cb = (now) => { if (window.__draw.on && !v.paused) window.__draw.del.push([now, src]); if (v.isConnected) v.requestVideoFrameCallback(cb) }
      v.requestVideoFrameCallback(cb)
    })
    setInterval(watch, 100); watch()
  })
  const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0 }
  for (const tier of tiers) {
    await page.evaluate((t) => { window.setQuality(t); window.__draw.on = false }, tier)
    await sleep(4000)
    await page.evaluate(() => { window.__draw.up = []; window.__draw.del = []; window.__draw.on = true })
    await sleep(secs * 1000)
    const { up, del, drawn } = await page.evaluate(() => { window.__draw.on = false; return { up: window.__draw.up, del: window.__draw.del, drawn: window.getPerfData().fps } })
    console.log(`\n=== ${tier} (app drawing ${drawn} fps)`)
    for (const clip of [...new Set(del.map((d) => d[1]))]) {
      const u = up.filter((x) => x[1] === clip).map((x) => x[0])
      const d = del.filter((x) => x[1] === clip).map((x) => x[0])
      if (d.length < 20) continue
      const dSecs = (d[d.length - 1] - d[0]) / 1000
      const period = med(d.slice(1).map((t, i) => t - d[i]))
      const holds = u.slice(1).map((t, i) => t - u[i])
      const longHolds = holds.filter((h) => h > period * 1.35)
      const bins = {}
      holds.forEach((h) => { const k = Math.round(h / 4) * 4; bins[k] = (bins[k] || 0) + 1 })
      const top = Object.entries(bins).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, n]) => `${k}ms x${n}`).join(', ')
      console.log(`${clip}: decoder delivers ${(d.length / dSecs).toFixed(1)}/s (frame period ${period.toFixed(1)}ms), uploaded ${(u.length / dSecs).toFixed(1)}/s, never uploaded ${Math.max(0, d.length - u.length)} of ${d.length}`)
      console.log(`   how long each shown frame is held: p50 ${med(holds).toFixed(1)}ms, longest ${Math.max(0, ...holds).toFixed(0)}ms, held too long (>1.35x period): ${longHolds.length} of ${holds.length} (${(100 * longHolds.length / Math.max(1, holds.length)).toFixed(0)}%); commonest holds: ${top}`)
    }
  }
  await browser.close()
})().catch((e) => { console.error('FAILED', e.message); process.exit(1) })
