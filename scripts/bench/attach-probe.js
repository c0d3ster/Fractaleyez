// node attach-probe.js   connects to a Chromium started with --remote-debugging-port=9222 and prints each page's state, changing nothing.
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core')
;(async () => {
  const browser = await chromium.connectOverCDP(process.env.CDP_URL || 'http://localhost:9222')
  for (const ctx of browser.contexts()) {
    for (const page of ctx.pages()) {
      const state = await page.evaluate(() => ({
        url: location.href,
        vis: document.visibilityState,
        order: window.config && window.config.layers && window.config.layers.order,
        quality: window.getQuality ? window.getQuality().setting + '/' + window.getQuality().tier : null,
        fps: window.getPerfData ? window.getPerfData().fps : null,
        videos: document.querySelectorAll('video').length,
        screen: [window.screenX, window.screenY, innerWidth, innerHeight],
        gpu: (() => { const gl = document.createElement('canvas').getContext('webgl'); const e = gl && gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'n/a' })(),
      })).catch((e) => ({ error: String(e).slice(0, 120) }))
      console.log(JSON.stringify(state))
    }
  }
  await browser.close()
})().catch((e) => { console.error('FAILED', e.message); process.exit(1) })
