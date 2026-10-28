// node win-bounds.js   prints the OS-level window bounds (CDP) of every page in a Chromium started with --remote-debugging-port=9222.
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core')
;(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222')
  for (const page of browser.contexts().flatMap((c) => c.pages())) {
    const session = await page.context().newCDPSession(page)
    const { windowId, bounds } = await session.send('Browser.getWindowForTarget')
    console.log(page.url().slice(0, 40).padEnd(42), windowId, JSON.stringify(bounds))
  }
  await browser.close()
})().catch((e) => { console.error('FAILED', e.message); process.exit(1) })
