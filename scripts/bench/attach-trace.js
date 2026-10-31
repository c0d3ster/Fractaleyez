// node attach-trace.js <label> <quality|ultra|...> [secs=30]   attaches to a Chromium started with --remote-debugging-port=9222, finds the app page,
// puts video in front of fractal, sets the quality tier, marks every video stall in the trace and records a lean trace (no reload, no new windows).
const fs = require('fs')
const path = require('path')
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core')
const OUT = process.env.BENCH_DIR || path.join(__dirname, 'out')
const [label, quality, secsArg] = process.argv.slice(2)
const secs = Number(secsArg || 30)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
;(async () => {
  const browser = await chromium.connectOverCDP(process.env.CDP_URL || 'http://localhost:9222')
  const page = browser.contexts().flatMap((c) => c.pages()).find((p) => p.url().startsWith('http://localhost:3001'))
  if (!page) throw new Error('no app page found')
  // Permissions a relaunched profile would otherwise ask for: the mic, and Window Management (which lets the app put the popout on the second screen).
  const browserSession = await browser.newBrowserCDPSession()
  await browserSession.send('Browser.grantPermissions', { origin: 'http://localhost:3001', permissions: ['audioCapture', 'windowManagement'] }).catch((e) => console.log('grantPermissions:', e.message))
  // PLACE=left,top,width,height moves the window (CDP window bounds), so a relaunch cannot leave it off screen.
  if (process.env.PLACE) {
    const [left, top, width, height] = process.env.PLACE.split(',').map(Number)
    const session = await page.context().newCDPSession(page)
    const { windowId } = await session.send('Browser.getWindowForTarget')
    await session.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } })
    await session.send('Browser.setWindowBounds', { windowId, bounds: { left, top, width, height } })
    // MAXIMIZE=1 then maximizes on the monitor the window now sits on.
    if (process.env.MAXIMIZE === '1') await session.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'maximized' } })
    await sleep(1000)
  }
  // A fresh profile waits for a click before the app starts (the benchmark harness clicks once too).
  for (let i = 0; i < 20 && !(await page.evaluate(() => typeof window.getPerfData === 'function')); i++) {
    if (i === 0) { await page.bringToFront(); await page.mouse.click(400, 300) }
    await sleep(500)
  }
  // POPOUT=1 opens the config popout with the e hotkey when no popout page exists yet (a real key press, so the browser allows the window).
  if (process.env.POPOUT === '1' && !browser.contexts().flatMap((c) => c.pages()).some((p) => p.url() === 'about:blank')) {
    await page.bringToFront()
    await page.keyboard.press('e')
    await sleep(3000)
    const popout = browser.contexts().flatMap((c) => c.pages()).find((p) => p.url() === 'about:blank')
    console.log('popout', popout ? JSON.stringify(await popout.evaluate(() => [window.screenX, window.screenY, innerWidth, innerHeight])) : 'did not open')
  }
  console.log('mic', await page.evaluate(() => navigator.permissions.query({ name: 'microphone' }).then((r) => r.state)), 'app window', JSON.stringify(await page.evaluate(() => [window.screenX, window.screenY, innerWidth, innerHeight])))
  await page.evaluate((q) => {
    window.config = { ...window.config, layers: { ...window.config.layers, order: ['fractal', 'video', 'orbit', 'logo'] } }
    window.setQuality(q)
    if (window.__marksInstalled) return
    window.__marksInstalled = true
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
  }, quality)
  await sleep(3000)
  console.log(await page.evaluate(() => JSON.stringify({ order: window.config.layers.order, q: window.getQuality().setting + '/' + window.getQuality().tier, fps: window.getPerfData().fps })))
  await browser.startTracing(page, { categories: process.env.CATS ? process.env.CATS.split(',') : ['toplevel', 'blink.user_timing', 'media', 'gpu'], screenshots: false })
  await sleep(secs * 1000)
  const buf = await browser.stopTracing()
  fs.writeFileSync(path.join(OUT, `trace-${label}.json`), buf)
  console.log('saved', (buf.length / 1048576).toFixed(0) + ' MB')
  await browser.close()
})().catch((e) => { console.error('FAILED', e.message); process.exit(1) })
