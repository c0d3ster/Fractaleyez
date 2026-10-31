// node place-window.js <left> <top> <width> <height>   moves and sizes the window of the app page in a Chromium started with --remote-debugging-port=9222.
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core')
const [left, top, width, height] = process.argv.slice(2).map(Number)
;(async () => {
  const browser = await chromium.connectOverCDP(process.env.CDP_URL || 'http://localhost:9222')
  const page = browser.contexts().flatMap((c) => c.pages()).find((p) => p.url().startsWith('http://localhost:3001'))
  if (!page) throw new Error('no app page found')
  const session = await page.context().newCDPSession(page)
  const { windowId } = await session.send('Browser.getWindowForTarget')
  await session.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } })
  await session.send('Browser.setWindowBounds', { windowId, bounds: { left, top, width, height } })
  console.log(JSON.stringify((await session.send('Browser.getWindowBounds', { windowId })).bounds))
  await browser.close()
})().catch((e) => { console.error('FAILED', e.message); process.exit(1) })
