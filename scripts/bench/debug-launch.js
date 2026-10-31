// node debug-launch.js   run against a Chromium started on about:blank with --remote-debugging-port=9222: grants the mic and Window Management
// permissions BEFORE the app loads (a grant after load cannot answer a prompt already shown), places and maximizes the window, loads the app,
// clicks once to start it, opens the config popout and puts video in front of fractal. PLACE=left,top,width,height picks the monitor (default: left one).
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core')
const APP = 'http://localhost:3001'
const [left, top, width, height] = (process.env.PLACE || '-1900,300,1800,940').split(',').map(Number)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
;(async () => {
  const browser = await chromium.connectOverCDP(process.env.CDP_URL || 'http://localhost:9222')
  const context = browser.contexts()[0]
  const page = context.pages()[0] ?? await context.newPage()
  const browserSession = await browser.newBrowserCDPSession()
  await browserSession.send('Browser.grantPermissions', { origin: APP, permissions: ['audioCapture', 'windowManagement'] })
  const session = await context.newCDPSession(page)
  const { windowId } = await session.send('Browser.getWindowForTarget')
  await session.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } })
  await session.send('Browser.setWindowBounds', { windowId, bounds: { left, top, width, height } })
  await session.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'maximized' } })
  // Brave restores last session's tabs; any other copy of the app would compete for the GPU, so only this page keeps the app.
  await Promise.all(context.pages().filter((p) => p !== page).map((p) => p.close().catch(() => undefined)))
  await page.goto(APP, { waitUntil: 'load' })
  await page.bringToFront()
  await page.mouse.click(400, 300)
  for (let i = 0; i < 60 && !(await page.evaluate(() => typeof window.getPerfData === 'function')); i++) await sleep(500)
  if (!(await page.evaluate(() => typeof window.getPerfData === 'function'))) throw new Error('the app did not start')
  await page.evaluate(() => { window.config = { ...window.config, layers: { ...window.config.layers, order: ['fractal', 'video', 'orbit', 'logo'] } } })
  await page.keyboard.press('e')
  await sleep(3500)
  // The popup opens on the app's monitor (and fills it); this moves it to the laptop display (POPOUT_PLACE=left,top,width,height) and maximizes it there.
  const popout = context.pages().find((p) => p.url() === 'about:blank')
  if (popout) {
    const [pl, pt, pw, ph] = (process.env.POPOUT_PLACE || '100,100,1400,800').split(',').map(Number)
    const ps = await context.newCDPSession(popout)
    const { windowId: popoutId } = await ps.send('Browser.getWindowForTarget')
    await ps.send('Browser.setWindowBounds', { windowId: popoutId, bounds: { windowState: 'normal' } })
    await ps.send('Browser.setWindowBounds', { windowId: popoutId, bounds: { left: pl, top: pt, width: pw, height: ph } })
    await ps.send('Browser.setWindowBounds', { windowId: popoutId, bounds: { windowState: 'maximized' } })
    await sleep(800)
  }
  const pages = context.pages()
  for (const p of pages) {
    const s = await context.newCDPSession(p)
    const { bounds } = await s.send('Browser.getWindowForTarget')
    console.log(p.url().slice(0, 30).padEnd(32), JSON.stringify(bounds))
  }
  console.log('mic', await page.evaluate(() => navigator.permissions.query({ name: 'microphone' }).then((r) => r.state)), '| fps', await page.evaluate(() => window.getPerfData().fps), '| tier', await page.evaluate(() => window.getQuality().setting + '/' + window.getQuality().tier))
  await browser.close()
})().catch((e) => { console.error('FAILED', e.message); process.exit(1) })
