// node monitor-test.js <left> <top> [secs=40] [tier]   moves the app window (maximized) onto the monitor whose area contains <left>,<top> and logs once a second:
// quality tier, app fps, whether the video is advancing, its state, dropped frames, WebGL context loss and renderer crashes.
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core')
const [left, top] = process.argv.slice(2, 4).map(Number)
const secs = Number(process.argv[4] || 40)
const tier = process.argv[5] || null
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
;(async () => {
  const browser = await chromium.connectOverCDP(process.env.CDP_URL || 'http://localhost:9222')
  const context = browser.contexts()[0]
  const page = context.pages().find((p) => p.url().startsWith('http://localhost:3001'))
  let crashed = false
  page.on('crash', () => { crashed = true })
  await page.evaluate(() => {
    if (window.__mt) return
    window.__mt = { lost: 0, restored: 0 }
    document.querySelectorAll('canvas').forEach((c) => { c.addEventListener('webglcontextlost', () => { window.__mt.lost++ }); c.addEventListener('webglcontextrestored', () => { window.__mt.restored++ }) })
  })
  if (tier) await page.evaluate((t) => window.setQuality(t), tier)
  const session = await context.newCDPSession(page)
  const { windowId } = await session.send('Browser.getWindowForTarget')
  await session.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } })
  await session.send('Browser.setWindowBounds', { windowId, bounds: { left, top, width: 1400, height: 800 } })
  await session.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'maximized' } })
  console.log('moved to', JSON.stringify((await session.send('Browser.getWindowBounds', { windowId })).bounds))
  let lastTime = -1
  let lastDropped = 0
  let frozenFor = 0
  for (let i = 0; i < secs; i++) {
    await sleep(1000)
    const s = await page.evaluate(() => {
      const v = document.querySelector('video')
      const q = v ? v.getVideoPlaybackQuality() : null
      return { tier: window.getQuality().setting + '/' + window.getQuality().tier, fps: window.getPerfData().fps, t: v ? +v.currentTime.toFixed(2) : null, paused: v ? v.paused : null, rs: v ? v.readyState : null, dropped: q ? q.droppedVideoFrames : null, lost: window.__mt.lost, w: innerWidth, h: innerHeight }
    }).catch((e) => ({ error: String(e).slice(0, 80) }))
    if (s.error) { console.log(String(i + 1).padStart(3) + 's', s.error, 'crashed', crashed); continue }
    const advancing = s.t !== lastTime
    frozenFor = advancing ? 0 : frozenFor + 1
    console.log(`${String(i + 1).padStart(3)}s ${s.tier.padEnd(14)} app ${String(s.fps).padStart(3)}fps  video ${String(s.t).padStart(5)}s ${advancing ? 'playing ' : 'FROZEN ' + frozenFor + 's'} rs${s.rs} dropped +${s.dropped - lastDropped}  ctxLost ${s.lost}  ${s.w}x${s.h}${crashed ? '  RENDERER CRASHED' : ''}`)
    lastTime = s.t
    lastDropped = s.dropped
  }
  await browser.close()
})().catch((e) => { console.error('FAILED', e.message); process.exit(1) })
