// node media-probe.js [secs=30]   attaches to a Chromium started with --remote-debugging-port=9222 and reports, for the app page's videos: which decoder Chrome
// uses (the DevTools Media panel's data, over CDP) and, from requestVideoFrameCallback metadata, per frame decode time and skipped frames.
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core')
const secs = Number(process.argv[2] || 30)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
;(async () => {
  const browser = await chromium.connectOverCDP(process.env.CDP_URL || 'http://localhost:9222')
  const page = browser.contexts().flatMap((c) => c.pages()).find((p) => p.url().startsWith('http://localhost:3000'))
  if (!page) throw new Error('no app page found')
  const session = await page.context().newCDPSession(page)
  const players = {}
  session.on('Media.playerPropertiesChanged', ({ playerId, properties }) => {
    const p = (players[playerId] ||= {})
    properties.forEach((x) => { p[x.name] = x.value })
  })
  await session.send('Media.enable')
  if (process.env.Q) await page.evaluate((q) => window.setQuality(q), process.env.Q)
  await page.evaluate(() => {
    window.__m = { frames: [], fps: [] }
    const seen = new WeakSet()
    const watch = () => document.querySelectorAll('video').forEach((v) => {
      if (seen.has(v)) return
      seen.add(v)
      const src = v.src.split('/').pop()
      let lastPresented = null
      let lastNow = null
      const cb = (now, m) => {
        if (!v.paused) window.__m.frames.push([now, src, m.mediaTime, m.presentedFrames, m.processingDuration ?? null, m.expectedDisplayTime - now, lastNow === null ? 0 : now - lastNow, lastPresented === null ? 1 : m.presentedFrames - lastPresented])
        lastPresented = m.presentedFrames
        lastNow = now
        if (v.isConnected) v.requestVideoFrameCallback(cb)
      }
      v.requestVideoFrameCallback(cb)
    })
    setInterval(watch, 100); watch()
  })
  await sleep(secs * 1000)
  const frames = await page.evaluate(() => window.__m.frames)
  const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : null }
  console.log('--- decoders (DevTools Media panel data)')
  Object.entries(players).forEach(([id, p]) => {
    if (!('kVideoDecoderName' in p) && !('kFrameUrl' in p)) return
    console.log(id.slice(-6), JSON.stringify({ url: String(p.kFrameUrl || '').split('/').pop(), decoder: p.kVideoDecoderName, platformDecoder: p.kIsPlatformVideoDecoder, w: p.kResolution, fps: p.kVideoFrameRate, framesDecoded: p.kFramesDecoded, framesDropped: p.kFramesDropped, hw: p.kVideoDecoderName }))
  })
  console.log('--- per clip, from frame callbacks')
  for (const clip of [...new Set(frames.map((f) => f[1]))]) {
    const f = frames.filter((x) => x[1] === clip)
    const gaps = f.map((x) => x[6]).filter((g) => g > 0 && g < 2500)
    const proc = f.map((x) => x[4]).filter((x) => x !== null).map((x) => x * 1000)
    const skipped = f.filter((x) => x[7] > 1)
    console.log(clip, JSON.stringify({ frames: f.length, gapP50: q(gaps, 0.5), gapP95: q(gaps, 0.95), gapMax: Math.max(...gaps), skippedEvents: skipped.length, skippedFrames: skipped.reduce((s, x) => s + x[7] - 1, 0), decodeMsP50: proc.length ? +q(proc, 0.5).toFixed(1) : null, decodeMsP95: proc.length ? +q(proc, 0.95).toFixed(1) : null, decodeMsMax: proc.length ? +Math.max(...proc).toFixed(1) : null }))
  }
  const worst = frames.filter((x) => x[6] > 0 && x[6] < 2500).sort((a, b) => b[6] - a[6]).slice(0, 10)
  const t0 = frames.length ? frames[0][0] : 0
  console.log('--- ten worst frame gaps: t(s) clip mediaTime gap(ms) decodeLatency(ms) skipped')
  worst.forEach((x) => console.log(((x[0] - t0) / 1000).toFixed(1).padStart(6), x[1].padEnd(11), x[2].toFixed(2).padStart(6), x[6].toFixed(0).padStart(5), x[4] === null ? '  n/a' : (x[4] * 1000).toFixed(0).padStart(5), x[7] - 1))
  const slowGaps = frames.filter((x) => x[6] > 60 && x[6] < 2500)
  const proc = (a) => a.map((x) => x[4]).filter((x) => x !== null).map((x) => x * 1000)
  console.log('decode latency p50 for gaps>60ms:', slowGaps.length ? q(proc(slowGaps), 0.5).toFixed(0) : 'n/a', 'ms (', slowGaps.length, 'gaps ) vs all frames:', q(proc(frames), 0.5).toFixed(0), 'ms')
  await browser.close()
})().catch((e) => { console.error('FAILED', e.message); process.exit(1) })
