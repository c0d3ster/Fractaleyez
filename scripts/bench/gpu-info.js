// node gpu-info.js   prints the overlay and video decode lines from chrome://gpu of a Chromium started with --remote-debugging-port=9222.
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core')
;(async () => {
  const browser = await chromium.connectOverCDP(process.env.CDP_URL || 'http://localhost:9222')
  const page = await browser.contexts()[0].newPage()
  await page.goto('chrome://gpu')
  await page.waitForTimeout(3000)
  const text = await page.evaluate(() => {
    const walk = (node, out) => { if (node.shadowRoot) walk(node.shadowRoot, out); node.childNodes.forEach((c) => (c.nodeType === 3 ? out.push(c.textContent) : walk(c, out))); return out }
    return walk(document.body, []).join(' ').replace(/\s+/g, ' ')
  })
  const find = (re) => (text.match(re) || [''])[0].slice(0, 160)
  console.log('overlays:', find(/Overlay[^.]{0,140}/i), '|', find(/Direct ?Composition[^.]{0,100}/i), '|', find(/Video Decode:[^A-Z]{0,40}[A-Za-z ]{0,30}/))
  await page.close()
  await browser.close()
})().catch((e) => { console.error('FAILED', e.message); process.exit(1) })
