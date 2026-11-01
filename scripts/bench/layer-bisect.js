// node layer-bisect.js [secs=50]   attaches to a Chromium started with --remote-debugging-port=9222 and, on a fixed quality tier, counts video gaps over 60ms, stalls
// (waiting events) and frame-loop gaps while switching layers off one at a time, to see which layer the video hitches depend on. Layers are restored at the end.
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core')
const secs = Number(process.argv[2] || 50)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const conditions = [
  ['all layers', []],
  ['no fractal', ['fractal']],
  ['no orbit', ['orbit']],
  ['no logo', ['logo']],
  ['video only', ['fractal', 'orbit', 'logo']],
]
;(async () => {
  const browser = await chromium.connectOverCDP(process.env.CDP_URL || 'http://localhost:9222')
  const page = browser.contexts().flatMap((c) => c.pages()).find((p) => p.url().startsWith('http://localhost:3000'))
  if (!page) throw new Error('no app page found')
  await page.evaluate((tier) => window.setQuality(tier), process.env.TIER || 'quality')
  await page.evaluate(() => {
    if (window.__lb) return
    window.__lb = { on: false, vg: [], waits: [], raf: [], ends: 0 }
    const seen = new WeakSet()
    const watch = () => document.querySelectorAll('video').forEach((v) => {
      if (seen.has(v)) return
      seen.add(v)
      let last = null
      v.addEventListener('waiting', () => { if (window.__lb.on) window.__lb.waits.push(+v.currentTime.toFixed(1)) })
      v.addEventListener('ended', () => { if (window.__lb.on) window.__lb.ends++ })
      const cb = (now) => { if (window.__lb.on && last !== null && !v.paused) window.__lb.vg.push(now - last); last = v.paused ? null : now; if (v.isConnected) v.requestVideoFrameCallback(cb) }
      v.requestVideoFrameCallback(cb)
    })
    setInterval(watch, 100); watch()
    let lr = performance.now()
    const tick = (now) => { const d = now - lr; lr = now; if (window.__lb.on && d > 40) window.__lb.raf.push(d); requestAnimationFrame(tick) }
    requestAnimationFrame(tick)
  })
  const all = ['fractal', 'orbit', 'logo']
  for (const [name, off] of conditions) {
    await page.evaluate(([offList, every]) => every.forEach((k) => window.setLayerEnabled(k, !offList.includes(k))), [off, all])
    await sleep(4000)
    await page.evaluate(() => { Object.assign(window.__lb, { on: true, vg: [], waits: [], raf: [], ends: 0 }) })
    await sleep(secs * 1000)
    const r = await page.evaluate(() => { window.__lb.on = false; return window.__lb })
    const g = r.vg.filter((x) => x < 2500)
    console.log(`${name.padEnd(12)} frames ${String(g.length).padStart(5)} | gaps>60ms ${String(g.filter((x) => x > 60).length).padStart(2)} | gaps>100ms ${g.filter((x) => x > 100).length} | max ${Math.max(0, ...g).toFixed(0).padStart(4)}ms | stalls(waiting) ${r.waits.length}${r.waits.length ? ' at ' + r.waits.join(',') + 's' : ''} | frame-loop gaps>40ms ${r.raf.length} | clip changes ${r.ends}`)
  }
  await page.evaluate((every) => every.forEach((k) => window.setLayerEnabled(k, true)), all)
  await browser.close()
})().catch((e) => { console.error('FAILED', e.message); process.exit(1) })
